from __future__ import annotations

from typing import Any

ALLOWED_FILTER_FIELDS = {
    "course_id",
    "doc_name",
    "chapter_id",
    "section_path",
    "node_type",
    "page_start",
    "page_end",
    "heading_level",
}


def sanitize_metadata_filters(metadata_filters: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata_filters:
        return {}

    sanitized: dict[str, Any] = {}
    for key, value in dict(metadata_filters).items():
        if key not in ALLOWED_FILTER_FIELDS or value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if key in {"page_start", "page_end", "heading_level"}:
            try:
                sanitized[key] = int(value)
            except (TypeError, ValueError):
                continue
        else:
            sanitized[key] = str(value)
    return sanitized


def build_filter_clauses(filters: dict[str, Any]) -> list[dict[str, Any]]:
    clauses: list[dict[str, Any]] = []
    for key, value in filters.items():
        if key == "page_start":
            clauses.append({"range": {"page_start": {"gte": int(value)}}})
        elif key == "page_end":
            clauses.append({"range": {"page_end": {"lte": int(value)}}})
        elif key == "heading_level":
            clauses.append({"term": {"heading_level": int(value)}})
        else:
            clauses.append({"term": {key: value}})
    return clauses
