from __future__ import annotations

import json
import re
from typing import Any


def build_outline_response(outline: Any) -> dict[str, Any]:
    if not isinstance(outline, dict):
        return {
            "found": False,
            "message": "Presentation outline is not available in memory yet.",
            "sections": [],
        }

    slides = outline.get("slides")
    if not isinstance(slides, list) or not slides:
        return {
            "found": False,
            "message": "Presentation outline exists but has no slides.",
            "sections": [],
        }

    sections = [_build_outline_section(position, slide) for position, slide in enumerate(slides)]
    return {
        "found": True,
        "slide_count": len(sections),
        "sections": sections,
        "source": outline.get("source", "memory"),
    }


def _build_outline_section(position: int, slide: Any) -> dict[str, Any]:
    index = position
    content = ""
    if isinstance(slide, dict):
        raw_index = slide.get("index")
        if isinstance(raw_index, int):
            index = raw_index
        raw_content = slide.get("content")
        content = _serialize_slide_content(raw_content)
    elif isinstance(slide, str):
        content = slide

    return {
        "index": index,
        "slide_number": index + 1,
        "title": extract_title(content) or f"Slide {index + 1}",
    }


def _serialize_slide_content(raw_content: Any) -> str:
    if isinstance(raw_content, str):
        return raw_content
    if raw_content is None:
        return ""
    try:
        return json.dumps(raw_content, ensure_ascii=False)
    except Exception:
        return str(raw_content)


def extract_title(markdown_content: str) -> str:
    for line in markdown_content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        heading_match = re.match(r"^#{1,6}\s*(.+?)\s*$", stripped)
        if heading_match:
            return heading_match.group(1).strip()
        return stripped[:120]
    return ""
