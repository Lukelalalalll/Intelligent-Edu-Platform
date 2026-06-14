"""OpenSearch sparse retrieval and course-index helpers for course RAG."""
from __future__ import annotations

import logging
from typing import Any, Iterable

from backend.config import Config
from backend.core.opensearch_client import (
    build_course_index_name,
    get_opensearch_client,
    opensearch_enabled,
)

from backend.services.course_rag_service.retrieval_helpers import tokenize_for_rerank

logger = logging.getLogger(__name__)

_ALLOWED_FILTER_FIELDS = {
    "course_id",
    "doc_name",
    "chapter_id",
    "section_path",
    "node_type",
    "page_start",
    "page_end",
    "heading_level",
}
_TEXT_FIELDS = ("text", "contextualized_text")
_SUPPORTED_NODE_TYPES = {"leaf_chunk", "table_chunk", "section_summary"}


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
            }
        },
    }


def ensure_course_sparse_index(
    course_id: str,
    *,
    client: Any | None = None,
    settings: Any | None = None,
) -> bool:
    if not opensearch_enabled(settings or Config):
        return False

    resolved_client = client or get_opensearch_client()
    if resolved_client is None:
        return False

    index_name = build_course_sparse_index_name(course_id, settings=settings)
    try:
        if bool(resolved_client.indices.exists(index=index_name)):
            return True
        resolved_client.indices.create(index=index_name, body=build_course_sparse_mapping())
        return True
    except Exception as exc:
        _log_warning_once("ensure_index", course_id, exc)
        return False


def build_opensearch_sparse_query(
    *,
    course_id: str,
    query: str,
    top_k: int,
    metadata_filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sanitized_filters = sanitize_metadata_filters(metadata_filters)
    filter_clauses: list[dict[str, Any]] = [{"term": {"course_id": str(course_id)}}]
    filter_clauses.extend(_build_filter_clauses(sanitized_filters))

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
                    "fields": [
                        "contextualized_text^2.0",
                        "text^1.0",
                    ],
                    "type": "best_fields",
                    "operator": "and",
                }
            }
        )

    bool_query: dict[str, Any] = {"filter": filter_clauses}
    if should:
        bool_query["should"] = should
        bool_query["minimum_should_match"] = 1

    body: dict[str, Any] = {
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
    return body


def sanitize_metadata_filters(metadata_filters: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata_filters:
        return {}

    sanitized: dict[str, Any] = {}
    for key, value in dict(metadata_filters).items():
        if key not in _ALLOWED_FILTER_FIELDS:
            continue
        if value is None:
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


def sync_course_sparse_index(
    course_id: str,
    documents: Iterable[dict[str, Any]],
    *,
    client: Any | None = None,
    settings: Any | None = None,
) -> bool:
    if not opensearch_enabled(settings or Config):
        return False

    resolved_client = client or get_opensearch_client()
    if resolved_client is None:
        return False
    if not ensure_course_sparse_index(course_id, client=resolved_client, settings=settings):
        return False

    index_name = build_course_sparse_index_name(course_id, settings=settings)
    docs = list(documents or [])
    try:
        resolved_client.delete_by_query(
            index=index_name,
            body={"query": {"term": {"course_id": str(course_id)}}},
            params={"conflicts": "proceed", "refresh": "true"},
        )
    except Exception as exc:
        _log_warning_once("clear_index", course_id, exc)
        return False

    if not docs:
        return True

    bulk_body: list[dict[str, Any]] = []
    for item in docs:
        payload = _normalize_index_document(course_id, item)
        if not payload:
            continue
        doc_id = str(payload.pop("_id"))
        bulk_body.append({"index": {"_index": index_name, "_id": doc_id}})
        bulk_body.append(payload)

    if not bulk_body:
        return True

    try:
        resolved_client.bulk(body=bulk_body, params={"refresh": "true"})
        return True
    except Exception as exc:
        _log_warning_once("bulk_sync", course_id, exc)
        return False


def delete_course_sparse_index(
    course_id: str,
    *,
    client: Any | None = None,
    settings: Any | None = None,
) -> bool:
    if not opensearch_enabled(settings or Config):
        return False

    resolved_client = client or get_opensearch_client()
    if resolved_client is None:
        return False

    index_name = build_course_sparse_index_name(course_id, settings=settings)
    try:
        if not bool(resolved_client.indices.exists(index=index_name)):
            return True
        resolved_client.indices.delete(index=index_name)
        return True
    except Exception as exc:
        _log_warning_once("delete_index", course_id, exc)
        return False


class OpenSearchSparseRetriever:
    """Sparse retrieval adapter with graceful fallback semantics."""

    source_tag = "opensearch_sparse"

    def __init__(self, *, client: Any | None = None, settings: Any | None = None):
        self._settings = settings or Config
        self._client = client

    def is_enabled(self) -> bool:
        return opensearch_enabled(self._settings)

    def is_available(self) -> bool:
        try:
            return self._resolve_client() is not None
        except Exception as exc:
            _log_warning_once("client_init", "_global", exc)
            return False

    def retrieve(
        self,
        *,
        course_id: str,
        query: str,
        top_k: int,
        metadata_filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return self.retrieve_with_status(
            course_id=course_id,
            query=query,
            top_k=top_k,
            metadata_filters=metadata_filters,
        )["results"]

    def retrieve_with_status(
        self,
        *,
        course_id: str,
        query: str,
        top_k: int,
        metadata_filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.is_enabled():
            return {"results": [], "status": "disabled", "source": self.source_tag}

        try:
            client = self._resolve_client()
        except Exception as exc:
            _log_warning_once("client_init", course_id, exc)
            return {"results": [], "status": "client_unavailable", "source": self.source_tag}

        if client is None:
            return {"results": [], "status": "client_unavailable", "source": self.source_tag}

        index_name = build_course_sparse_index_name(course_id, settings=self._settings)
        try:
            if not bool(client.indices.exists(index=index_name)):
                return {"results": [], "status": "index_missing", "source": self.source_tag}
        except Exception as exc:
            _log_warning_once("index_exists", course_id, exc)
            return {"results": [], "status": "index_check_failed", "source": self.source_tag}

        query_body = build_opensearch_sparse_query(
            course_id=course_id,
            query=query,
            top_k=top_k,
            metadata_filters=metadata_filters,
        )

        try:
            response = client.search(index=index_name, body=query_body)
        except Exception as exc:
            _log_warning_once("search", course_id, exc)
            return {"results": [], "status": "request_failed", "source": self.source_tag}

        hits = (((response or {}).get("hits") or {}).get("hits") or [])
        results: list[dict[str, Any]] = []
        active_filters = sanitize_metadata_filters(metadata_filters)
        for rank, hit in enumerate(hits, start=1):
            normalized = _normalize_search_hit(
                course_id=course_id,
                query=query,
                hit=hit,
                rank=rank,
                active_filters=active_filters,
            )
            if normalized:
                results.append(normalized)
        return {"results": results, "status": "ok", "source": self.source_tag}

    def _resolve_client(self) -> Any | None:
        if self._client is not None:
            return self._client
        return get_opensearch_client()


def _build_filter_clauses(filters: dict[str, Any]) -> list[dict[str, Any]]:
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


def _normalize_search_hit(
    *,
    course_id: str,
    query: str,
    hit: dict[str, Any],
    rank: int,
    active_filters: dict[str, Any],
) -> dict[str, Any] | None:
    source = dict((hit or {}).get("_source") or {})
    text = str(source.get("contextualized_text") or source.get("text") or "").strip()
    if not text:
        return None

    node_type = str(source.get("node_type") or "leaf_chunk")
    if node_type not in _SUPPORTED_NODE_TYPES:
        return None

    score = float((hit or {}).get("_score") or 0.0)
    doc_name = str(source.get("doc_name") or "")
    section_path = str(source.get("section_path") or "")
    page_start = _safe_int(source.get("page_start"), default=-1)
    page_end = _safe_int(source.get("page_end"), default=page_start)
    heading_level = _safe_int(source.get("heading_level"), default=0)
    title_overlap = _overlap(query, doc_name)
    heading_overlap = _overlap(query, section_path)
    lexical_overlap = _overlap(query, text)
    doc_id = str((hit or {}).get("_id") or "")

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
        "chunk_id": doc_id,
        "page_num": page_start,
        "page_start": page_start,
        "page_end": page_end,
        "node_type": node_type,
        "element_type": "paragraph",
        "parser_used": "opensearch",
        "token_count": max(1, len(text.split())),
        "index_version": "",
        "heading_level": heading_level,
        "retrieval_sources": [OpenSearchSparseRetriever.source_tag],
        "source_rank": rank,
        "title_overlap": round(title_overlap, 4),
        "heading_overlap": round(heading_overlap, 4),
        "lexical_overlap": round(lexical_overlap, 4),
        "filter_match": 1.0 if active_filters else 0.0,
    }


def _normalize_index_document(course_id: str, item: dict[str, Any]) -> dict[str, Any] | None:
    metadata = dict(item.get("metadata") or {})
    text = str(item.get("text") or "").strip()
    contextualized_text = str(item.get("contextualized_text") or "").strip()
    if not text and not contextualized_text:
        return None

    doc_id = str(item.get("id") or metadata.get("chunk_stable_id") or metadata.get("chunk_id") or "")
    if not doc_id:
        return None

    return {
        "_id": doc_id,
        "course_id": str(course_id),
        "doc_name": str(metadata.get("doc_name") or ""),
        "chapter_id": str(metadata.get("chapter_id") or ""),
        "section_path": str(metadata.get("section_path") or ""),
        "node_type": str(metadata.get("node_type") or "leaf_chunk"),
        "page_start": _safe_int(metadata.get("page_start"), default=_safe_int(metadata.get("page_num"), default=-1)),
        "page_end": _safe_int(metadata.get("page_end"), default=_safe_int(metadata.get("page_num"), default=-1)),
        "heading_level": _safe_int(metadata.get("heading_level"), default=0),
        "text": text,
        "contextualized_text": contextualized_text or text,
    }


def _safe_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _overlap(query: str, text: str) -> float:
    query_tokens = tokenize_for_rerank(query)
    text_tokens = tokenize_for_rerank(text)
    return len(query_tokens & text_tokens) / max(1, len(query_tokens))


_warning_keys: set[str] = set()


def _log_warning_once(stage: str, course_id: str, exc: Exception) -> None:
    key = f"{stage}:{course_id}:{type(exc).__name__}:{str(exc)[:120]}"
    if key in _warning_keys:
        return
    _warning_keys.add(key)
    logger.warning("OpenSearch sparse %s failed for course=%s: %s", stage, course_id, str(exc)[:200])
