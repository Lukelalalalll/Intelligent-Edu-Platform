from __future__ import annotations

from ..types import logger
from .ai_gateway import call_ai
from .audience_profiles import resolve_audience_hint
from .json_parsing import parse_string_array
from .prompt_templates import SPLIT_PROMPT_EN, SPLIT_PROMPT_ZH


async def optimize_full_script(
    raw_text: str,
    lang: str = "zh",
    provider: str = "local_ollama",
    max_segments: int = 8,
    audience: str = "student",
) -> list[str]:
    template = SPLIT_PROMPT_ZH if lang == "zh" else SPLIT_PROMPT_EN
    n = max(3, min(15, max_segments))
    audience_hint = resolve_audience_hint(audience, lang)
    try:
        raw = await call_ai(
            template.format(text=raw_text[:3000], n=n, audience_hint=audience_hint),
            provider,
        )
        segments = parse_string_array(raw, limit=n)
        if segments:
            return segments
    except Exception as exc:
        logger.warning("AI script split failed: %s", exc)

    paras = [paragraph.strip() for paragraph in raw_text.split("\n\n") if len(paragraph.strip()) > 30]
    return paras[:n] or [raw_text[:500]]
