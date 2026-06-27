"""Compatibility facade for course RAG retrieval helper functions."""
from __future__ import annotations

from backend.application.architecture_facades.course_rag_retrieval_helpers_impl import (
    build_evidence_spans,
    doc_hash,
    evidence_insufficient_message,
    expand_chunk_window,
    fusion_merge,
    normalize_query_for_retrieval,
    pack_evidence,
    postcheck_and_downgrade,
    reorder_for_llm,
    rerank_results,
    should_retry_empty,
    should_return_insufficient,
    tokenize_for_rerank,
)

__all__ = [
    "build_evidence_spans",
    "doc_hash",
    "evidence_insufficient_message",
    "expand_chunk_window",
    "fusion_merge",
    "normalize_query_for_retrieval",
    "pack_evidence",
    "postcheck_and_downgrade",
    "reorder_for_llm",
    "rerank_results",
    "should_retry_empty",
    "should_return_insufficient",
    "tokenize_for_rerank",
]
