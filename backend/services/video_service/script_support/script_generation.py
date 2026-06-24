from __future__ import annotations

import asyncio

from ..types import logger
from .ai_gateway import call_ai
from .audience_profiles import resolve_audience_hint
from .prompt_templates import SCRIPT_PROMPT_EN, SCRIPT_PROMPT_ZH


async def generate_scripts(
    chunks: list[str],
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
) -> list[str]:
    template = SCRIPT_PROMPT_ZH if lang == "zh" else SCRIPT_PROMPT_EN
    audience_hint = resolve_audience_hint(audience, lang)

    async def _one(chunk: str) -> str:
        try:
            result = await call_ai(
                template.format(
                    content=chunk[:800],
                    audience_hint=audience_hint,
                    rag_context="",
                ),
                provider,
            )
            return result.strip() or chunk[:200]
        except Exception as exc:
            logger.warning(
                "AI script generation failed for chunk, using raw text: %s",
                exc,
            )
            return chunk[:200]

    return list(await asyncio.gather(*[_one(chunk) for chunk in chunks]))
