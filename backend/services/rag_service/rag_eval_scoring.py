"""Shared scoring functions for RAG evaluation.

Used by both rag_eval_service (dataset-based runs) and
rag_eval_wizard_service (wizard A/B evaluation) to ensure consistent
evaluation semantics.
"""
from __future__ import annotations

from typing import Any, Dict, List, Set


def score_chunk(
    chunk: Dict[str, Any],
    expected_docs: Set[str],
    expected_keywords: List[str],
) -> bool:
    """Return True if a retrieved chunk counts as a 'correct citation'.

    A chunk is correct when:
    1. Its doc_name ∈ expected_docs (skip check if expected_docs is empty), AND
    2. ALL expected_keywords appear in the chunk text (skip check if empty).
    """
    doc_name = str(chunk.get("doc_name", "")).strip()
    text = str(chunk.get("text", "")).lower()

    doc_ok = (doc_name in expected_docs) if expected_docs else True
    kw_ok = (
        all(k.strip().lower() in text for k in expected_keywords if k.strip())
        if expected_keywords
        else True
    )
    return doc_ok and kw_ok


def score_case(
    retrieved: List[Dict[str, Any]],
    expected_docs: Set[str],
    expected_keywords: List[str],
    is_degenerate: bool,
) -> Dict[str, Any]:
    """Score a single evaluation case.

    Returns dict with: hit, correct_citations, total_citations,
    per_chunk (list of bool for each chunk).
    """
    if is_degenerate:
        return {
            "hit": False,
            "correct_citations": 0,
            "total_citations": 0,
            "per_chunk": [],
        }

    total = len(retrieved)
    correct = 0
    per_chunk: List[bool] = []

    for chunk in retrieved:
        ok = score_chunk(chunk, expected_docs, expected_keywords)
        per_chunk.append(ok)
        if ok:
            correct += 1

    return {
        "hit": correct > 0,
        "correct_citations": correct,
        "total_citations": total,
        "per_chunk": per_chunk,
    }


def compute_mrr(
    retrieved_doc_names: List[str],
    expected_docs: Set[str],
) -> float:
    """Compute reciprocal rank for a single query.

    Returns 1/rank of the first matching document, or 0 if no match.
    """
    if not expected_docs:
        return 0.0
    for rank, doc_name in enumerate(retrieved_doc_names, 1):
        if doc_name in expected_docs:
            return 1.0 / rank
    return 0.0


def compute_ndcg(
    retrieved_doc_names: List[str],
    expected_docs: Set[str],
    k: int = 5,
) -> float:
    """Compute NDCG@k for a single query.

    Uses binary relevance: 1 if doc_name ∈ expected_docs, else 0.
    """
    import math

    if not expected_docs:
        return 0.0

    # DCG@k
    dcg = 0.0
    for i, doc_name in enumerate(retrieved_doc_names[:k]):
        rel = 1.0 if doc_name in expected_docs else 0.0
        dcg += rel / math.log2(i + 2)  # i+2 because i is 0-indexed

    # Ideal DCG@k: all relevant docs ranked first
    n_relevant = min(len(expected_docs), k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(n_relevant))

    return dcg / idcg if idcg > 0 else 0.0


def compute_recall_at_k(
    retrieved_doc_names: List[str],
    expected_docs: Set[str],
    k: int = 10,
) -> float:
    """Compute Recall@k: fraction of expected docs found in top-k results."""
    if not expected_docs:
        return 0.0
    retrieved_set = set(retrieved_doc_names[:k])
    found = len(expected_docs & retrieved_set)
    return found / len(expected_docs)
