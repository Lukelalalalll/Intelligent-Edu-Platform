"""Neural cross-encoder reranking for RAG results.

Uses a lightweight cross-encoder model to rescore the top-N candidates
after initial retrieval + lexical reranking. The cross-encoder evaluates
(query, passage) pairs jointly, capturing semantic relationships that
bi-encoder similarity and token overlap cannot.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_cross_encoder():
    """Lazy-load the cross-encoder model (singleton, ~200MB on first load)."""
    from sentence_transformers import CrossEncoder
    from backend.config import Config

    return CrossEncoder(Config.RAG_NEURAL_RERANK_MODEL, max_length=768)


def neural_rerank(
    query: str, candidates: List[Dict[str, Any]], top_k: int,
) -> List[Dict[str, Any]]:
    """Rescore candidates using a neural cross-encoder.

    Blends cross-encoder score (0.6) with the original retrieval score (0.4)
    to avoid completely discarding the initial ranking signal.
    """
    if not candidates:
        return candidates

    encoder = _get_cross_encoder()
    pairs = [(query, _build_reranker_input(c)) for c in candidates]
    raw_scores = encoder.predict(pairs)

    # Normalize cross-encoder scores to [0, 1] via sigmoid-like mapping
    import numpy as np
    ce_scores = 1.0 / (1.0 + np.exp(-np.array(raw_scores, dtype=float)))

    for c, ce_s in zip(candidates, ce_scores):
        original = float(c.get("score", 0.0))
        c["score"] = round(0.6 * float(ce_s) + 0.4 * original, 4)
        c["ce_score"] = round(float(ce_s), 4)

    candidates.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return candidates[:top_k]


def _build_reranker_input(candidate: Dict[str, Any]) -> str:
    title = str(candidate.get("section_title") or candidate.get("doc_name") or "").strip()
    heading = str(candidate.get("heading_path") or "").strip()
    text = str(candidate.get("text", "")).strip()
    excerpt = text[:700]
    parts = []
    if title:
        parts.append(f"Title: {title}")
    if heading and heading != title:
        parts.append(f"Heading: {heading}")
    parts.append(f"Passage: {excerpt}")
    return "\n".join(parts)
