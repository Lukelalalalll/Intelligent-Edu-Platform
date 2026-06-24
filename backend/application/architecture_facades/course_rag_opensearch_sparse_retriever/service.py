from __future__ import annotations

import logging
from typing import Any, Iterable

from backend.config import Config
from backend.core.opensearch_client import get_opensearch_client, opensearch_enabled

from .filters import sanitize_metadata_filters
from .normalization import normalize_index_document, normalize_search_hit
from .queries import (
    build_course_sparse_index_name,
    build_course_sparse_mapping,
    build_opensearch_sparse_query,
)

logger = logging.getLogger(__name__)
_warning_keys: set[str] = set()


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
        log_warning_once("ensure_index", course_id, exc)
        return False


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
        log_warning_once("clear_index", course_id, exc)
        return False

    if not docs:
        return True

    bulk_body: list[dict[str, Any]] = []
    for item in docs:
        payload = normalize_index_document(course_id, item)
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
        log_warning_once("bulk_sync", course_id, exc)
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
        log_warning_once("delete_index", course_id, exc)
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
            log_warning_once("client_init", "_global", exc)
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
            log_warning_once("client_init", course_id, exc)
            return {"results": [], "status": "client_unavailable", "source": self.source_tag}

        if client is None:
            return {"results": [], "status": "client_unavailable", "source": self.source_tag}

        index_name = build_course_sparse_index_name(course_id, settings=self._settings)
        try:
            if not bool(client.indices.exists(index=index_name)):
                return {"results": [], "status": "index_missing", "source": self.source_tag}
        except Exception as exc:
            log_warning_once("index_exists", course_id, exc)
            return {"results": [], "status": "index_check_failed", "source": self.source_tag}

        try:
            response = client.search(
                index=index_name,
                body=build_opensearch_sparse_query(
                    course_id=course_id,
                    query=query,
                    top_k=top_k,
                    metadata_filters=metadata_filters,
                ),
            )
        except Exception as exc:
            log_warning_once("search", course_id, exc)
            return {"results": [], "status": "request_failed", "source": self.source_tag}

        active_filters = sanitize_metadata_filters(metadata_filters)
        results: list[dict[str, Any]] = []
        hits = (((response or {}).get("hits") or {}).get("hits") or [])
        for rank, hit in enumerate(hits, start=1):
            normalized = normalize_search_hit(
                course_id=course_id,
                query=query,
                hit=hit,
                rank=rank,
                active_filters=active_filters,
                source_tag=self.source_tag,
            )
            if normalized:
                results.append(normalized)
        return {"results": results, "status": "ok", "source": self.source_tag}

    def _resolve_client(self) -> Any | None:
        if self._client is not None:
            return self._client
        return get_opensearch_client()


def log_warning_once(stage: str, course_id: str, exc: Exception) -> None:
    key = f"{stage}:{course_id}:{type(exc).__name__}:{str(exc)[:120]}"
    if key in _warning_keys:
        return
    _warning_keys.add(key)
    logger.warning(
        "OpenSearch sparse %s failed for course=%s: %s",
        stage,
        course_id,
        str(exc)[:200],
    )
