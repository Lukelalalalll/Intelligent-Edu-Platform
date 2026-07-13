"""OpenSearch sparse retrieval and course-index helpers for course RAG."""
from __future__ import annotations

from backend.application.architecture_facades.course_rag_opensearch_sparse_retriever.filters import (
    sanitize_metadata_filters,
)
from backend.application.architecture_facades.course_rag_opensearch_sparse_retriever.queries import (
    build_course_sparse_index_name,
    build_course_sparse_mapping,
    build_opensearch_sparse_query,
)
from backend.application.architecture_facades.course_rag_opensearch_sparse_retriever.service import (
    OpenSearchSparseRetriever,
    delete_course_sparse_index,
    ensure_course_sparse_index,
    sync_course_sparse_index,
)

__all__ = [
    "OpenSearchSparseRetriever",
    "build_course_sparse_index_name",
    "build_course_sparse_mapping",
    "build_opensearch_sparse_query",
    "delete_course_sparse_index",
    "ensure_course_sparse_index",
    "sanitize_metadata_filters",
    "sync_course_sparse_index",
]
