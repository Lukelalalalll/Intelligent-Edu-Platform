"""Ranking and fusion logic for retrieval candidates."""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List

from .text_ops import tokenize_for_rerank


def rerank_results(query: str, items: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    if not items:
        return []

    query_tokens = tokenize_for_rerank(query)
    if not query_tokens:
        return items[:top_k]

    dedup: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = hashlib.sha1(str(item.get("text", "")).encode("utf-8", errors="ignore")).hexdigest()
        if key not in dedup or float(item.get("score", 0.0)) > float(dedup[key].get("score", 0.0)):
            dedup[key] = item

    base_scores = [float(item.get("score", 0.0)) for item in dedup.values()]
    max_base = max(base_scores) if base_scores else 1.0
    rescored: List[Dict[str, Any]] = []
    for item in dedup.values():
        base = float(item.get("score", 0.0))
        norm_score = base / max(max_base, 1e-9)
        text_tokens = tokenize_for_rerank(item.get("text", ""))
        title_tokens = tokenize_for_rerank(item.get("section_title", "") or item.get("doc_name", ""))
        heading_tokens = tokenize_for_rerank(item.get("heading_path", "") or item.get("section_path", ""))
        overlap = len(query_tokens & text_tokens) / max(1, len(query_tokens))
        title_overlap = len(query_tokens & title_tokens) / max(1, len(query_tokens))
        heading_overlap = len(query_tokens & heading_tokens) / max(1, len(query_tokens))
        filter_match = float(item.get("filter_match", 0.0) or 0.0)
        node_type_bonus = 0.08 if str(item.get("node_type", "")).startswith("section_") else 0.0
        final_score = (
            0.50 * norm_score
            + 0.20 * overlap
            + 0.10 * title_overlap
            + 0.10 * heading_overlap
            + 0.06 * filter_match
            + node_type_bonus
        )
        enriched = dict(item)
        enriched["score"] = round(final_score, 4)
        enriched["retrieval_score"] = round(base, 4)
        enriched["overlap_score"] = round(overlap, 4)
        enriched["title_overlap"] = round(title_overlap, 4)
        enriched["heading_overlap"] = round(heading_overlap, 4)
        enriched["_norm_score"] = norm_score
        rescored.append(enriched)

    rescored.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
    return rescored[:top_k]


def fusion_merge(
    results_lists: List[List[Dict[str, Any]]],
    *,
    query_class: str,
    top_k: int,
) -> List[Dict[str, Any]]:
    if not results_lists:
        return []

    ranked_pool: Dict[str, Dict[str, Any]] = {}
    feature_weights = _weights_for_query_class(query_class)

    for list_idx, results in enumerate(results_lists):
        for rank, item in enumerate(results):
            key = _candidate_key(item)
            candidate = dict(ranked_pool.get(key) or item)
            candidate.setdefault("retrieval_sources", [])
            candidate["retrieval_sources"] = sorted(
                set(candidate.get("retrieval_sources", [])) | set(item.get("retrieval_sources", []))
            )
            candidate["course_id"] = item.get("course_id", candidate.get("course_id", ""))
            candidate["doc_name"] = item.get("doc_name", candidate.get("doc_name", ""))
            candidate["text"] = item.get("text", candidate.get("text", ""))
            candidate["fusion_features"] = _merge_features(
                candidate.get("fusion_features", {}),
                item,
                rank=rank,
                list_idx=list_idx,
            )
            ranked_pool[key] = candidate

    rescored: list[dict[str, Any]] = []
    for item in ranked_pool.values():
        feats = item.get("fusion_features", {})
        score = _score_candidate(feats, feature_weights)
        enriched = dict(item)
        enriched["score"] = round(score, 4)
        enriched["fusion_score"] = round(score, 4)
        enriched["source_rank"] = int(feats.get("best_rank", 99))
        rescored.append(enriched)

    rescored.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
    return rescored[: max(1, top_k)]


def _candidate_key(item: Dict[str, Any]) -> str:
    text_sig = hashlib.sha1(str(item.get("text", "")).encode("utf-8", errors="ignore")).hexdigest()[:16]
    return f"{item.get('course_id', '')}_{item.get('doc_name', '')}_{text_sig}"


def _merge_features(existing: dict[str, Any], item: Dict[str, Any], *, rank: int, list_idx: int) -> dict[str, Any]:
    feats = dict(existing or {})
    feats["dense_score"] = max(float(feats.get("dense_score", 0.0)), float(item.get("raw_vector_score", 0.0) or 0.0))
    feats["sparse_score"] = max(
        float(feats.get("sparse_score", 0.0)),
        float(item.get("sparse_score", item.get("retrieval_score", 0.0)) or 0.0),
    )
    feats["title_overlap"] = max(float(feats.get("title_overlap", 0.0)), float(item.get("title_overlap", 0.0) or 0.0))
    feats["heading_overlap"] = max(
        float(feats.get("heading_overlap", 0.0)),
        float(item.get("heading_overlap", 0.0) or 0.0),
    )
    feats["filter_match"] = max(float(feats.get("filter_match", 0.0)), float(item.get("filter_match", 0.0) or 0.0))
    feats["node_bonus"] = max(float(feats.get("node_bonus", 0.0)), _node_bonus(str(item.get("node_type", ""))))
    feats["query_prior"] = max(float(feats.get("query_prior", 0.0)), float(item.get("query_prior", 0.0) or 0.0))
    feats["best_rank"] = min(int(feats.get("best_rank", 999)), int(rank) + 1)
    feats["source_count"] = int(feats.get("source_count", 0)) + 1
    feats["list_bias"] = min(float(feats.get("list_bias", 0.0)) + (0.02 if list_idx == 0 else 0.0), 0.05)
    feats["retrieval_score"] = max(float(feats.get("retrieval_score", 0.0)), float(item.get("score", 0.0)))
    return feats


def _score_candidate(feats: dict[str, Any], weights: dict[str, float]) -> float:
    return (
        weights["dense"] * float(feats.get("dense_score", 0.0))
        + weights["sparse"] * float(feats.get("sparse_score", 0.0))
        + weights["title"] * float(feats.get("title_overlap", 0.0))
        + weights["heading"] * float(feats.get("heading_overlap", 0.0))
        + weights["filter"] * float(feats.get("filter_match", 0.0))
        + weights["node"] * float(feats.get("node_bonus", 0.0))
        + weights["prior"] * float(feats.get("query_prior", 0.0))
        + weights["list_bias"] * float(feats.get("list_bias", 0.0))
        + weights["rank"] * (1.0 / max(1.0, float(feats.get("best_rank", 1))))
    )


def _weights_for_query_class(query_class: str) -> dict[str, float]:
    base = {
        "dense": 0.30,
        "sparse": 0.30,
        "title": 0.12,
        "heading": 0.10,
        "filter": 0.10,
        "node": 0.04,
        "prior": 0.02,
        "list_bias": 0.01,
        "rank": 0.01,
    }
    if query_class == "keyword/factoid":
        base.update({"sparse": 0.42, "dense": 0.24, "filter": 0.12})
    elif query_class == "concept/explanation":
        base.update({"dense": 0.38, "sparse": 0.22, "title": 0.14})
    elif query_class == "comparison":
        base.update({"dense": 0.28, "sparse": 0.24, "heading": 0.16, "prior": 0.08})
    elif query_class == "multi-hop":
        base.update({"dense": 0.26, "sparse": 0.22, "heading": 0.18, "prior": 0.10})
    elif query_class == "chapter/doc constrained":
        base.update({"filter": 0.22, "sparse": 0.26, "dense": 0.24})
    elif query_class == "out-of-domain":
        base.update({"dense": 0.18, "sparse": 0.18, "prior": 0.0})
    return base


def _node_bonus(node_type: str) -> float:
    if node_type == "section_summary":
        return 0.12
    if node_type == "table_chunk":
        return 0.08
    return 0.0


__all__ = ["fusion_merge", "rerank_results"]
