from __future__ import annotations

from ..types import logger
from .ai_gateway import call_ai
from .json_parsing import parse_json_object
from .prompt_templates import ARC_PLAN_PROMPT_EN, ARC_PLAN_PROMPT_ZH


async def plan_narrative_arc(
    segments: list[str],
    lang: str = "zh",
    provider: str = "local_ollama",
    user: dict | None = None,
) -> dict | None:
    if not segments:
        return None

    template = ARC_PLAN_PROMPT_ZH if lang == "zh" else ARC_PLAN_PROMPT_EN
    prompt = template.format(
        n=len(segments),
        segments="\n".join(f"[{i}] {segment[:150]}" for i, segment in enumerate(segments)),
    )

    try:
        arc = parse_json_object(
            await call_ai(
                prompt,
                provider,
                user=user,
                system_override="You are a teaching video director planning narrative flow. Return valid JSON only.",
            )
        )
        if not arc:
            logger.warning(
                "plan_narrative_arc: LLM returned non-parsable JSON, skipping arc"
            )
            return None
        if "segments" not in arc or not isinstance(arc.get("segments"), list):
            return None
        return arc
    except Exception as exc:
        logger.warning("plan_narrative_arc failed: %s — continuing without arc", exc)
        return None


def weave_narrative_arc(
    segments: list[str],
    arc: dict,
    lang: str = "zh",
) -> list[str]:
    if not arc or not segments:
        return segments

    arc_by_idx = {
        item.get("index", index): item
        for index, item in enumerate(arc.get("segments", []))
    }
    opening_hook = arc.get("opening_hook", "")
    closing_cta = arc.get("closing_cta", "")
    separator = "，" if lang == "zh" else " — "

    result: list[str] = []
    for index, script in enumerate(segments):
        arc_item = arc_by_idx.get(index, {})
        transition = arc_item.get("transition", "")

        if index == 0 and opening_hook:
            if not script.startswith(opening_hook[:10]):
                script = opening_hook + separator + script
        elif transition and not script.startswith(transition[:10]):
            script = transition + separator + script

        if index == len(segments) - 1 and closing_cta:
            if not script.endswith(closing_cta[-10:]):
                script = script + separator + closing_cta

        result.append(script)
    return result
