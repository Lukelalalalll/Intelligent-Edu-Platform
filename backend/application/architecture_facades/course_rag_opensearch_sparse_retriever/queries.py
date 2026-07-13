from __future__ import annotations

from typing import Any

from backend.core.opensearch_client import build_course_index_name
from backend.services.course_rag_service.retrieval_helpers import tokenize_for_rerank

from .filters import build_filter_clauses, sanitize_metadata_filters


def build_course_sparse_index_name(
    course_id: str,
    *,
    settings: Any | None = None,
) -> str:
    return build_course_index_name(course_id, suffix="sparse", settings=settings)


def build_course_sparse_mapping() -> dict[str, Any]:
    return {
        "settings": {
            "index": {
                "number_of_shards": 1,
                "number_of_replicas": 0,
            }
        },
        "mappings": {
            "dynamic": False,
            "properties": {
                "course_id": {"type": "keyword"},
                "doc_name": {
                    "type": "keyword",
                    "fields": {"text": {"type": "text"}},
                },
                "chapter_id": {"type": "keyword"},
                "section_path": {
                    "type": "keyword",
                    "fields": {"text": {"type": "text"}},
                },
                "node_type": {"type": "keyword"},
                "page_start": {"type": "integer"},
                "page_end": {"type": "integer"},
                "heading_level": {"type": "integer"},
                "text": {"type": "text"},
                "contextualized_text": {"type": "text"},
            },
        },
    }


def build_opensearch_sparse_query(
    *,
    course_id: str,
    query: str,
    top_k: int,
    metadata_filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sanitized_filters = sanitize_metadata_filters(metadata_filters)
    filter_clauses: list[dict[str, Any]] = [{"term": {"course_id": str(course_id)}}]
    filter_clauses.extend(build_filter_clauses(sanitized_filters))

    should: list[dict[str, Any]] = []
    content_query = str(query or "").strip()
    if content_query:
        should.append(
            {
                "multi_match": {
                    "query": content_query,
                    "fields": [
                        "contextualized_text^2.0",
                        "text^1.0",
                        "doc_name.text^0.4",
                        "section_path.text^0.5",
                    ],
                    "type": "best_fields",
                    "operator": "or",
                }
            }
        )

    tokens = sorted(tokenize_for_rerank(content_query))
    if tokens:
        should.append(
            {
                "multi_match": {
                    "query": " ".join(tokens),
                    "fields": ["contextualized_text^2.0", "text^1.0"],
                    "type": "best_fields",
                    "operator": "and",
                }
            }
        )

    bool_query: dict[str, Any] = {"filter": filter_clauses}
    if should:
        bool_query["should"] = should
        bool_query["minimum_should_match"] = 1

    return {
        "size": max(1, int(top_k)),
        "query": {"bool": bool_query},
        "sort": [
            {"_score": {"order": "desc"}},
            {"page_start": {"order": "asc"}},
            {"heading_level": {"order": "asc"}},
        ],
        "_source": [
            "course_id",
            "doc_name",
            "chapter_id",
            "section_path",
            "node_type",
            "page_start",
            "page_end",
            "heading_level",
            "text",
            "contextualized_text",
        ],
    }
