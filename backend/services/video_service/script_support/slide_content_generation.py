from __future__ import annotations

import asyncio

from ..types import logger
from .ai_gateway import call_ai
from .audience_profiles import resolve_audience_hint
from .json_parsing import parse_json_object
from .prompt_templates import SLIDE_PROMPT_EN, SLIDE_PROMPT_ZH

_VALID_LAYOUTS = {
    "title-bullets",
    "image-left",
    "image-right",
    "image-top",
    "big-quote",
    "two-column",
}


async def generate_slide_contents(
    scripts: list[str],
    source_text: str,
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
) -> list[dict]:
    audience_hint = resolve_audience_hint(audience, lang)
    template = SLIDE_PROMPT_ZH if lang == "zh" else SLIDE_PROMPT_EN
    normalized_scripts = [script if isinstance(script, str) else str(script) for script in scripts]
    rag_context_str = _build_rag_context(source_text, normalized_scripts)
    empty_context = "(无额外参考)" if lang == "zh" else "(no additional context)"

    async def _one(script: str) -> dict:
        try:
            raw = await call_ai(
                template.format(
                    script=script[:500],
                    audience_hint=audience_hint,
                    rag_context=rag_context_str or empty_context,
                ),
                provider,
            )
            parsed = parse_json_object(raw)
            if parsed and "title" in parsed and "bullets" in parsed:
                return _normalize_slide_payload(parsed)
        except Exception as exc:
            logger.warning("Slide content generation failed: %s", exc)
        return _fallback_slide_payload(script, lang)

    return list(await asyncio.gather(*[_one(script) for script in normalized_scripts]))


def _build_rag_context(source_text: str, scripts: list[str]) -> str:
    if not source_text or len(source_text) <= 100:
        return ""
    try:
        from backend.services.rag_service.tfidf_rag_service import LocalRagService

        rag_result = LocalRagService().build_rag_context(
            document_text=source_text,
            query=" ".join(str(script)[:60] for script in scripts[:3]),
            top_k=4,
        )
        chunks = rag_result.get("retrieved_chunks", [])
        if chunks:
            return "\n".join(chunk.get("text", "")[:200] for chunk in chunks[:4])
    except Exception as exc:
        logger.warning("RAG context retrieval failed, proceeding without: %s", exc)
    return ""


def _normalize_slide_payload(parsed: dict) -> dict:
    layout_type = parsed.get("layoutType", "title-bullets")
    result: dict = {
        "title": str(parsed["title"])[:60],
        "bullets": [str(bullet)[:80] for bullet in parsed["bullets"][:7]],
        "layoutType": layout_type if layout_type in _VALID_LAYOUTS else "title-bullets",
    }
    if layout_type == "big-quote" and parsed.get("quoteText"):
        result["quoteText"] = str(parsed["quoteText"])[:80]
    if layout_type == "two-column":
        result["col1Title"] = str(parsed.get("col1Title", ""))[:40]
        result["col1Bullets"] = [str(bullet)[:60] for bullet in (parsed.get("col1Bullets") or [])[:5]]
        result["col2Title"] = str(parsed.get("col2Title", ""))[:40]
        result["col2Bullets"] = [str(bullet)[:60] for bullet in (parsed.get("col2Bullets") or [])[:5]]
    return result


def _fallback_slide_payload(script: str, lang: str) -> dict:
    lines = script.strip().split("。" if lang == "zh" else ". ")
    return {
        "title": lines[0][:40] if lines else "",
        "bullets": [line[:60] for line in lines[1:4]] or [script[:60]],
        "layoutType": "title-bullets",
    }
