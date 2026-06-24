from __future__ import annotations

from typing import Any

from .scoring import overlap

SUPPORTED_NODE_TYPES = {"leaf_chunk", "table_chunk", "section_summary"}


def normalize_search_hit(
    *,
    course_id: str,
    query: str,
    hit: dict[str, Any],
    rank: int,
    active_filters: dict[str, Any],
    source_tag: str,
) -> dict[str, Any] | None:
    source = dict((hit or {}).get("_source") or {})
    text = str(source.get("contextualized_text") or source.get("text") or "").strip()
    if not text:
        return None

    node_type = str(source.get("node_type") or "leaf_chunk")
    if node_type not in SUPPORTED_NODE_TYPES:
        return None

    score = float((hit or {}).get("_score") or 0.0)
    doc_name = str(source.get("doc_name") or "")
    section_path = str(source.get("section_path") or "")
    page_start = safe_int(source.get("page_start"), default=-1)
    page_end = safe_int(source.get("page_end"), default=page_start)
    heading_level = safe_int(source.get("heading_level"), default=0)
    return {
        "course_id": course_id,
        "text": text,
        "score": round(score, 4),
        "sparse_score": round(score, 4),
        "retrieval_score": round(score, 4),
        "doc_name": doc_name,
        "chapter_id": str(source.get("chapter_id") or ""),
        "section_title": section_path.split(" > ")[-1] if section_path else "",
        "section_path": section_path,
        "heading_path": section_path,
        "chunk_id": str((hit or {}).get("_id") or ""),
        "page_num": page_start,
        "page_start": page_start,
        "page_end": page_end,
        "node_type": node_type,
        "element_type": "paragraph",
        "parser_used": "opensearch",
        "token_count": max(1, len(text.split())),
        "index_version": "",
        "heading_level": heading_level,
        "retrieval_sources": [source_tag],
        "source_rank": rank,
        "title_overlap": round(overlap(query, doc_name), 4),
        "heading_overlap": round(overlap(query, section_path), 4),
        "lexical_overlap": round(overlap(query, text), 4),
        "filter_match": 1.0 if active_filters else 0.0,
    }


def normalize_index_document(
    course_id: str,
    item: dict[str, Any],
) -> dict[str, Any] | None:
    metadata = dict(item.get("metadata") or {})
    text = str(item.get("text") or "").strip()
    contextualized_text = str(item.get("contextualized_text") or "").strip()
    if not text and not contextualized_text:
        return None

    doc_id = str(
        item.get("id")
        or metadata.get("chunk_stable_id")
        or metadata.get("chunk_id")
        or ""
    )
    if not doc_id:
        return None

    page_num = safe_int(metadata.get("page_num"), default=-1)
    return {
        "_id": doc_id,
        "course_id": str(course_id),
        "doc_name": str(metadata.get("doc_name") or ""),
        "chapter_id": str(metadata.get("chapter_id") or ""),
        "section_path": str(metadata.get("section_path") or ""),
        "node_type": str(metadata.get("node_type") or "leaf_chunk"),
        "page_start": safe_int(metadata.get("page_start"), default=page_num),
        "page_end": safe_int(metadata.get("page_end"), default=page_num),
        "heading_level": safe_int(metadata.get("heading_level"), default=0),
        "text": text,
        "contextualized_text": contextualized_text or text,
    }


def safe_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
