"""Reranking, Reciprocal Rank Fusion, and text-similarity helpers (pure functions)."""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List


def doc_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def tokenize_for_rerank(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    return {t for t in tokens if len(t) >= 2}


def rerank_results(
    query: str, items: List[Dict[str, Any]], top_k: int,
) -> List[Dict[str, Any]]:
    if not items:
        return []

    query_tokens = tokenize_for_rerank(query)
    if not query_tokens:
        return items[:top_k]

    dedup: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = hashlib.sha1(
            str(item.get("text", "")).encode("utf-8", errors="ignore")
        ).hexdigest()
        if key not in dedup or float(item.get("score", 0.0)) > float(
            dedup[key].get("score", 0.0)
        ):
            dedup[key] = item

    rescored: List[Dict[str, Any]] = []
    for item in dedup.values():
        base = float(item.get("score", 0.0))
        text_tokens = tokenize_for_rerank(item.get("text", ""))
        overlap = len(query_tokens & text_tokens) / max(1, len(query_tokens))
        title_tokens = tokenize_for_rerank(
            item.get("section_title", "") or item.get("doc_name", "")
        )
        title_overlap = len(query_tokens & title_tokens) / max(1, len(query_tokens))

        final_score = 0.65 * base + 0.25 * overlap + 0.10 * title_overlap
        enriched = dict(item)
        enriched["score"] = round(final_score, 4)
        enriched["retrieval_score"] = round(base, 4)
        enriched["overlap_score"] = round(overlap, 4)
        rescored.append(enriched)

    rescored.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return rescored[:top_k]


def rrf_merge(
    results_lists: List[List[Dict[str, Any]]],
    k: int = 60,
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    """Merge multiple ranked result lists using Reciprocal Rank Fusion."""
    scores: Dict[str, float] = {}
    items: Dict[str, Dict[str, Any]] = {}

    for results in results_lists:
        for rank, item in enumerate(results):
            text_sig = hashlib.sha1(
                str(item.get("text", "")).encode("utf-8", errors="ignore")
            ).hexdigest()[:16]
            key = f"{item['course_id']}_{item['doc_name']}_{text_sig}"
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            if key not in items:
                items[key] = item

    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    merged = []
    for key in sorted_keys[:top_k]:
        item = items[key].copy()
        item["score"] = round(scores[key], 4)
        merged.append(item)
    return merged
