from __future__ import annotations

import re

from ..types import logger
from .ai_gateway import call_ai
from .audience_profiles import resolve_audience_hint
from .json_parsing import parse_string_array
from .prompt_templates import (
    SEED_EXPANSION_PROMPT_EN,
    SEED_EXPANSION_PROMPT_ZH,
    SPLIT_PROMPT_EN,
    SPLIT_PROMPT_ZH,
)


async def optimize_full_script(
    raw_text: str,
    lang: str = "zh",
    provider: str = "local_ollama",
    max_segments: int = 8,
    audience: str = "student",
    user: dict | None = None,
) -> list[str]:
    split_template = SPLIT_PROMPT_ZH if lang == "zh" else SPLIT_PROMPT_EN
    seed_template = SEED_EXPANSION_PROMPT_ZH if lang == "zh" else SEED_EXPANSION_PROMPT_EN
    max_n = max(3, min(15, max_segments))
    min_n = 3
    audience_hint = resolve_audience_hint(audience, lang)
    normalized_text = str(raw_text or "").strip()
    seed_like = _looks_like_seed_prompt(normalized_text, lang=lang)
    template = seed_template if seed_like else split_template
    try:
        raw = await call_ai(
            template.format(
                text=normalized_text[:3000],
                min_n=min_n,
                max_n=max_n,
                audience_hint=audience_hint,
            ),
            provider,
            user=user,
            system_override="You are an instructional designer who splits teaching material into strong spoken video segments. Return clean JSON only.",
        )
        segments = parse_string_array(raw, limit=max_n)
        if segments and (not seed_like or len(segments) >= min_n):
            return segments
        if segments:
            logger.warning(
                "AI returned only %d segment(s) for a short video seed; expanding with fallback logic.",
                len(segments),
            )
    except Exception as exc:
        logger.warning("AI script split failed: %s", exc)

    if seed_like:
        return _fallback_seed_segments(normalized_text, lang=lang, min_n=min_n, max_n=max_n)

    paras = [paragraph.strip() for paragraph in normalized_text.split("\n\n") if len(paragraph.strip()) > 30]
    if len(paras) >= min_n:
        return paras[:max_n]

    sentence_segments = _split_sentences(normalized_text, lang=lang)
    if len(sentence_segments) >= min_n:
        return sentence_segments[:max_n]

    return _fallback_seed_segments(normalized_text, lang=lang, min_n=min_n, max_n=max_n)


def _looks_like_seed_prompt(raw_text: str, *, lang: str) -> bool:
    text = str(raw_text or "").strip()
    if not text:
        return True
    if "\n\n" in text:
        return False
    if len(text) <= 120:
        return True
    if lang == "en":
        words = [token for token in re.split(r"\s+", text) if token]
        return len(words) <= 18
    return len(text) <= 80


def _split_sentences(raw_text: str, *, lang: str) -> list[str]:
    if not raw_text:
        return []
    if lang == "zh":
        parts = re.split(r"[。！？；\n]+", raw_text)
    else:
        parts = re.split(r"[.!?;\n]+", raw_text)
    return [part.strip() for part in parts if len(part.strip()) > 20]


def _fallback_seed_segments(raw_text: str, *, lang: str, min_n: int, max_n: int) -> list[str]:
    text = str(raw_text or "").strip() or ("教学视频主题" if lang == "zh" else "teaching video topic")
    upper = max(min_n, min(4, max_n))
    if lang == "zh":
        candidates = [
            f"先用一个开场镜头引出主题：{text}，让观众快速知道这段视频要展示什么核心场景与重点。",
            f"接着展开主要内容，围绕{text}补充关键人物、环境、动作和教学价值，让画面与讲解都有明确焦点。",
            f"然后加入更具体的细节或变化，从不同角度继续表现{text}，让视频内容更完整、更有层次。",
            f"最后用一个收束镜头总结{text}带来的整体印象或核心结论，形成自然完整的结尾。",
        ]
    else:
        candidates = [
            f"Open the video by introducing the core idea of {text}, giving viewers a clear sense of the setting and purpose of the scene.",
            f"Develop the main scene around {text}, adding the important people, environment, actions, and teaching focus that should anchor the visual.",
            f"Add a follow-up beat that shows {text} from another angle or with richer detail so the sequence feels layered instead of static.",
            f"Close with a concluding beat that reinforces the overall meaning and mood of {text}, giving the short video a natural payoff.",
        ]
    return candidates[:upper]
