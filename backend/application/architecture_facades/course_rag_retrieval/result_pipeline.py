from __future__ import annotations

import time
from typing import Any

from backend.config import Config
from backend.services.course_rag_service.cache import get_cached_results, set_cached_results
from backend.services.course_rag_service.query_handler import maybe_neural_rerank
from backend.services.course_rag_service.retrieval_evaluator import evaluate_retrieval_confidence
from backend.services.course_rag_service.retrieval_helpers import (
    build_evidence_spans,
    fusion_merge,
    reorder_for_llm,
    rerank_results,
)
from backend.services.course_rag_service.types import RetrievalResponse


def get_cached_retrieval_response(
    service,
    *,
    target_courses: list[str],
    normalized_query: str,
    retrieval_plan,
    chapter_id: str,
    debug: bool,
    debug_retrieval: bool,
) -> RetrievalResponse | None:
    cached = get_cached_results(
        target_courses,
        normalized_query,
        use_hybrid=retrieval_plan.use_hybrid,
        rag_profile=retrieval_plan.retrieval_profile,
        force_query_class=retrieval_plan.query_class,
        chapter_id=chapter_id,
        metadata_filters=retrieval_plan.metadata_filters,
    )
    if cached is None:
        return None

    confidence = evaluate_retrieval_confidence(
        query=normalized_query,
        results=cached,
        metadata_filters=retrieval_plan.metadata_filters,
    )
    return RetrievalResponse(
        results=service._decorate_debug(cached, debug or debug_retrieval),
        retrieval_plan=retrieval_plan.to_dict(),
        retrieval_trace=[{"stage": "cache_hit", "count": len(cached)}],
        retrieval_confidence=confidence.to_dict(),
        fallback_reason="",
        evidence_spans=build_evidence_spans(cached),
        latency_ms=0.0,
    )


def build_empty_response(
    *,
    target_courses: list[str],
    normalized_query: str,
    retrieval_plan,
    chapter_id: str,
    trace: list[dict[str, Any]],
    started: float,
) -> RetrievalResponse:
    set_cached_results(
        target_courses,
        normalized_query,
        [],
        use_hybrid=retrieval_plan.use_hybrid,
        rag_profile=retrieval_plan.retrieval_profile,
        force_query_class=retrieval_plan.query_class,
        chapter_id=chapter_id,
        metadata_filters=retrieval_plan.metadata_filters,
    )
    return RetrievalResponse(
        results=[],
        retrieval_plan=retrieval_plan.to_dict(),
        retrieval_trace=trace,
        retrieval_confidence=evaluate_retrieval_confidence(query=normalized_query, results=[]).to_dict(),
        fallback_reason="empty",
        evidence_spans=[],
        latency_ms=round((time.perf_counter() - started) * 1000, 2),
    )


def finalize_retrieval_response(
    service,
    *,
    target_courses: list[str],
    normalized_query: str,
    retrieval_plan,
    chapter_id: str,
    candidate_lists: list[list[dict[str, Any]]],
    trace: list[dict[str, Any]],
    started: float,
    top_k: int,
    debug: bool,
    debug_retrieval: bool,
) -> RetrievalResponse:
    fusion_started = time.perf_counter()
    fused = fusion_merge(
        candidate_lists,
        query_class=retrieval_plan.query_class,
        top_k=max(top_k * 3, Config.RAG_STAGE1_CANDIDATE_LIMIT),
    )
    trace.append(
        {"stage": "fusion", "count": len(fused), "latency_ms": round((time.perf_counter() - fusion_started) * 1000, 2)}
    )

    stage1_started = time.perf_counter()
    stage1 = rerank_results(
        query=normalized_query,
        items=fused,
        top_k=max(top_k * 2, Config.RAG_STAGE1_CANDIDATE_LIMIT),
    )
    trace.append(
        {"stage": "stage1_rerank", "count": len(stage1), "latency_ms": round((time.perf_counter() - stage1_started) * 1000, 2)}
    )

    stage2_started = time.perf_counter()
    stage2 = maybe_neural_rerank(
        normalized_query,
        stage1[: max(Config.RAG_STAGE2_CANDIDATE_LIMIT, top_k)],
        top_k=max(top_k, min(Config.RAG_STAGE2_CANDIDATE_LIMIT, len(stage1))),
    )
    trace.append(
        {"stage": "stage2_rerank", "count": len(stage2), "latency_ms": round((time.perf_counter() - stage2_started) * 1000, 2)}
    )

    result = stage2[:top_k]
    if Config.RAG_LOST_IN_MIDDLE_REORDER:
        reorder_started = time.perf_counter()
        result = reorder_for_llm(result)
        trace.append(
            {
                "stage": "reorder_for_llm",
                "count": len(result),
                "latency_ms": round((time.perf_counter() - reorder_started) * 1000, 2),
            }
        )

    confidence = evaluate_retrieval_confidence(
        query=normalized_query,
        results=result,
        metadata_filters=retrieval_plan.metadata_filters,
    )
    evidence_spans = build_evidence_spans(result)
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    decorated = service._decorate_debug(result, debug or debug_retrieval)

    set_cached_results(
        target_courses,
        normalized_query,
        decorated,
        use_hybrid=retrieval_plan.use_hybrid,
        rag_profile=retrieval_plan.retrieval_profile,
        force_query_class=retrieval_plan.query_class,
        chapter_id=chapter_id,
        metadata_filters=retrieval_plan.metadata_filters,
    )
    return RetrievalResponse(
        results=decorated,
        retrieval_plan=retrieval_plan.to_dict(),
        retrieval_trace=trace,
        retrieval_confidence=confidence.to_dict(),
        fallback_reason="" if confidence.label == "confident" else "low_confidence",
        evidence_spans=evidence_spans,
        latency_ms=latency_ms,
    )


def decorate_debug(items: list[dict[str, Any]], debug: bool) -> list[dict[str, Any]]:
    if not debug:
        return items
    decorated: list[dict[str, Any]] = []
    for item in items:
        enriched = dict(item)
        enriched.setdefault("active_index_version", enriched.get("index_version", ""))
        enriched.setdefault("rerank_score", enriched.get("score", 0.0))
        decorated.append(enriched)
    return decorated
