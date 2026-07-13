"""Support modules for course RAG retrieval helpers."""

from .evidence import (
    build_evidence_spans,
    evidence_insufficient_message,
    expand_chunk_window,
    pack_evidence,
    postcheck_and_downgrade,
    reorder_for_llm,
    should_retry_empty,
    should_return_insufficient,
)
from .ranking import fusion_merge, rerank_results
from .text_ops import doc_hash, normalize_query_for_retrieval, tokenize_for_rerank

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
