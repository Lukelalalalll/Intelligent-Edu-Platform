from __future__ import annotations

from backend.services.course_rag_service.retrieval_helpers import tokenize_for_rerank


def overlap(query: str, text: str) -> float:
    query_tokens = tokenize_for_rerank(query)
    text_tokens = tokenize_for_rerank(text)
    return len(query_tokens & text_tokens) / max(1, len(query_tokens))
