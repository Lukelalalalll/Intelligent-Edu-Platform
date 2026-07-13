from __future__ import annotations

import asyncio

from ..types import logger
from .ai_gateway import call_ai
from .audience_profiles import resolve_audience_hint
from .json_parsing import parse_json_object

_VALID_SHOT_TYPES = {
    "broll",
    "diagram",
    "talking-head",
    "screen",
    "title-card",
}

_SCENE_VISUAL_PROMPT = """You are planning the visual treatment for one scene in an AI-generated teaching video.
{audience_hint}

Course/source context:
{source_context}

Narration script:
{script}

Slide title:
{title}

Slide bullets:
{bullets}

Suggested layout:
{layout_type}

Return JSON only with this shape:
{{
  "visualPrompt": "One vivid text-to-video prompt, 35-90 words, describing subjects, setting, action, composition, and mood.",
  "negativePrompt": "Optional extra things to avoid beyond the global negative prompt.",
  "shotType": "broll",
  "durationSeconds": 4
}}

Rules:
- Do not copy the narration verbatim.
- Convert abstract concepts into concrete, generative visuals.
- Prefer visual scenes over text-on-screen.
- Keep the shot useful for an academic explainer video.
- durationSeconds must be an integer from 3 to 6.
- shotType must be one of: broll, diagram, talking-head, screen, title-card.
- Return JSON only.
"""


async def generate_scene_visuals(
    scenes: list[dict],
    source_text: str,
    *,
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
    user: dict | None = None,
) -> list[dict]:
    audience_hint = resolve_audience_hint(audience, lang)
    source_context = _trim_source_context(source_text)

    async def _one(index: int, scene: dict) -> dict:
        try:
            raw = await call_ai(
                _SCENE_VISUAL_PROMPT.format(
                    audience_hint=audience_hint,
                    source_context=source_context,
                    script=str(scene.get("script") or "").strip()[:800] or "(empty)",
                    title=str(scene.get("slideTitle") or f"Scene {index + 1}").strip()[:160] or "(untitled)",
                    bullets=_stringify_bullets(scene),
                    layout_type=str(scene.get("layoutType") or "title-bullets").strip(),
                ),
                provider,
                user=user,
                system_override="You are a teaching video visual director. Return only valid JSON for cinematic text-to-video scene prompts.",
            )
            parsed = parse_json_object(raw)
            if parsed:
                normalized = _normalize_visual_payload(parsed)
                if normalized.get("visualPrompt"):
                    return normalized
        except Exception as exc:
            logger.warning("Scene visual generation failed for scene %s: %s", index + 1, exc)

        return {}

    return list(await asyncio.gather(*[_one(index, scene) for index, scene in enumerate(scenes)]))


def _trim_source_context(source_text: str) -> str:
    cleaned = " ".join(str(source_text or "").split())
    if not cleaned:
        return "(no extra source context)"
    return cleaned[:1500]


def _stringify_bullets(scene: dict) -> str:
    raw_bullets = scene.get("bullets") or []
    bullets = [str(item).strip() for item in raw_bullets if str(item).strip()]
    if bullets:
        return "\n".join(f"- {bullet[:160]}" for bullet in bullets[:5])
    body = str(scene.get("slideBody") or "").strip()
    if body:
        return body[:400]
    return "(no bullet points)"


def _normalize_visual_payload(parsed: dict) -> dict:
    visual_prompt = str(
        parsed.get("visualPrompt")
        or parsed.get("visual_prompt")
        or parsed.get("prompt")
        or ""
    ).strip()
    negative_prompt = str(
        parsed.get("negativePrompt")
        or parsed.get("negative_prompt")
        or ""
    ).strip()
    shot_type = str(parsed.get("shotType") or parsed.get("shot_type") or "broll").strip().lower()
    if shot_type not in _VALID_SHOT_TYPES:
        shot_type = "broll"
    duration_value = parsed.get("durationSeconds") or parsed.get("duration_seconds") or 4
    try:
        duration_seconds = int(duration_value)
    except (TypeError, ValueError):
        duration_seconds = 4
    duration_seconds = max(3, min(6, duration_seconds))
    return {
        "visualPrompt": visual_prompt[:600],
        "negativePrompt": negative_prompt[:300],
        "shotType": shot_type,
        "durationSeconds": duration_seconds,
    }
