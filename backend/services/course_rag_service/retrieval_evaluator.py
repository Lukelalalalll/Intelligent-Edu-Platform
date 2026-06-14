"""Confidence scoring and fallback decisions for adaptive retrieval."""
from __future__ import annotations

from collections import Counter
from typing import Any

from .retrieval_helpers import tokenize_for_rerank
from .types import RetrievalConfidence


def evaluate_retrieval_confidence(
    *,
    query: str,
    results: list[dict[str, Any]],
    metadata_filters: dict[str, Any] | None = None,
) -> RetrievalConfidence:
    if not results:
        return RetrievalConfidence(label="incorrect", score=0.0)

    query_tokens = tokenize_for_rerank(query)
    top_scores = [float(item.get("score", 0.0)) for item in results[:5]]
    top_score = top_scores[0] if top_scores else 0.0
    second_score = top_scores[1] if len(top_scores) > 1 else 0.0
    score_margin = max(0.0, top_score - second_score)

    coverages = []
    for item in results[:5]:
        tokens = tokenize_for_rerank(item.get("text", ""))
        coverages.append(len(tokens & query_tokens) / max(1, len(query_tokens)))
    coverage = sum(coverages) / max(1, len(coverages))

    retrieval_sources = []
    docs = []
    filter_hits = 0
    filters = metadata_filters or {}
    for item in results[:5]:
        retrieval_sources.extend(item.get("retrieval_sources", []))
        docs.append(str(item.get("doc_name", "")))
        if _matches_filters(item, filters):
            filter_hits += 1

    source_counts = Counter(retrieval_sources)
    source_agreement = min(1.0, len(source_counts) / 3.0 + (0.25 if len(source_counts) >= 2 else 0.0))
    unique_docs = len({d for d in docs if d})
    source_diversity = min(1.0, unique_docs / max(1, len(docs)))
    filter_satisfaction = filter_hits / max(1, min(5, len(results)))

    score = (
        0.35 * coverage
        + 0.20 * min(1.0, top_score)
        + 0.15 * min(1.0, score_margin * 4.0)
        + 0.15 * source_agreement
        + 0.10 * filter_satisfaction
        + 0.05 * source_diversity
    )

    if score >= 0.62 and coverage >= 0.18:
        label = "confident"
    elif score >= 0.38:
        label = "ambiguous"
    else:
        label = "incorrect"

    return RetrievalConfidence(
        label=label,
        score=round(score, 4),
        coverage=round(coverage, 4),
        score_margin=round(score_margin, 4),
        source_agreement=round(source_agreement, 4),
        filter_satisfaction=round(filter_satisfaction, 4),
        source_diversity=round(source_diversity, 4),
    )


def should_trigger_web_correction(confidence: RetrievalConfidence, *, allow_web_correction: bool) -> bool:
    if not allow_web_correction:
        return False
    return confidence.label in {"ambiguous", "incorrect"}


def _matches_filters(item: dict[str, Any], filters: dict[str, Any]) -> bool:
    if not filters:
        return True
    for key, value in filters.items():
        if key in {"page_start", "page_end"}:
            page_value = int(item.get(key, item.get("page_num", -1)) or -1)
            if page_value != int(value):
                return False
            continue
        if str(item.get(key, "") or "") != str(value):
            return False
    return True
