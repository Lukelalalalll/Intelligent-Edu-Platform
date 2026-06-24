from __future__ import annotations

from typing import Optional

from ..extract import extract_text_from_md_txt, extract_text_from_pdf
from .arc_planning import plan_narrative_arc, weave_narrative_arc
from .segmentation import optimize_full_script


async def smart_extract(
    text: Optional[str] = None,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    max_segments: int = 8,
    lang: str = "zh",
    provider: str = "local_ollama",
    audience: str = "student",
    apply_arc: bool = True,
) -> list[str]:
    if file_path:
        raw_chunks = (
            extract_text_from_pdf(file_path)
            if file_type == "pdf"
            else extract_text_from_md_txt(file_path)
        )
        full_text = "\n\n".join(raw_chunks)
    elif text:
        full_text = text
    else:
        return []

    segments = await optimize_full_script(
        full_text,
        lang,
        provider,
        max_segments,
        audience,
    )
    if apply_arc and len(segments) > 1:
        arc = await plan_narrative_arc(segments, lang, provider)
        if arc:
            segments = weave_narrative_arc(segments, arc, lang)
    return segments
