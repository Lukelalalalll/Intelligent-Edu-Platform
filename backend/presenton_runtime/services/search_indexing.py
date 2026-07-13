from __future__ import annotations

from typing import Any


def _flatten_text(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = " ".join(value.split()).strip()
        return [cleaned] if cleaned else []
    if isinstance(value, dict):
        parts: list[str] = []
        for nested in value.values():
            parts.extend(_flatten_text(nested))
        return parts
    if isinstance(value, list):
        parts: list[str] = []
        for nested in value:
            parts.extend(_flatten_text(nested))
        return parts
    return [str(value)]


def normalize_search_text(*parts: Any) -> str:
    flattened: list[str] = []
    for part in parts:
        flattened.extend(_flatten_text(part))
    return " ".join(item for item in flattened if item).strip()


def build_slide_content_text(content: dict[str, Any] | None) -> str:
    return normalize_search_text(content or {})


def build_slide_search_text(
    *,
    content: dict[str, Any] | None,
    speaker_note: str | None = None,
    html_content: str | None = None,
    layout: str | None = None,
) -> str:
    return normalize_search_text(content or {}, speaker_note or "", html_content or "", layout or "")


def build_presentation_search_text(presentation) -> str:
    return normalize_search_text(
        getattr(presentation, "title", None),
        getattr(presentation, "content", None),
        getattr(presentation, "outlines", None),
        getattr(presentation, "instructions", None),
        getattr(presentation, "language", None),
    )


def update_presentation_search_text(presentation) -> None:
    presentation.search_text = build_presentation_search_text(presentation)


def update_slide_search_text(slide) -> None:
    slide.search_text = build_slide_search_text(
        content=getattr(slide, "content", None),
        speaker_note=getattr(slide, "speaker_note", None),
        html_content=getattr(slide, "html_content", None),
        layout=getattr(slide, "layout", None),
    )
