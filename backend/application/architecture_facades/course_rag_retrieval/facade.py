"""Retrieval workflows for course RAG."""
from __future__ import annotations

import logging
import time
from typing import Any

from backend.config import Config
from backend.services.course_rag_service.opensearch_sparse_retriever import OpenSearchSparseRetriever
from backend.services.course_rag_service.retrieval_helpers import normalize_query_for_retrieval
from backend.services.course_rag_service.retrieval_planner import build_retrieval_plan
from backend.services.course_rag_service.store_manager import CourseRagStoreManager
from backend.services.course_rag_service.types import RetrievalResponse

from .candidate_sources import (
    bm25_retrieve,
    build_chroma_filter,
    metadata_filter_match,
    retrieve_late_interaction_candidates,
    retrieve_sparse_candidates,
    retrieve_vector_candidates,
    sparse_retrieve_one,
    token_overlap,
    vector_retrieve_one,
)
from .query_plan import build_query_set, collect_available_metadata
from .result_pipeline import (
    build_empty_response,
    decorate_debug,
    finalize_retrieval_response,
    get_cached_retrieval_response,
)

logger = logging.getLogger(__name__)


class CourseRagRetrievalService:
    """Owns adaptive retrieval orchestration for student queries."""

    def __init__(self, *, store_manager: CourseRagStoreManager):
        self._store_manager = store_manager
        self._opensearch_sparse = OpenSearchSparseRetriever()

    def _bm25_retrieve(
        self,
        course_id: str,
        query: str,
        top_k: int,
        *,
        chapter_id: str = "",
        metadata_filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return bm25_retrieve(
            self._store_manager,
            course_id,
            query,
            top_k,
            chapter_id=chapter_id,
            metadata_filters=metadata_filters,
        )

    async def retrieve_for_student(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: list[str] | None = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
        debug: bool = False,
        rag_profile: str = "",
        debug_retrieval: bool = False,
        allow_web_correction: bool = False,
        force_query_class: str = "",
    ) -> list[dict[str, Any]]:
        response = await self.retrieve_for_student_detailed(
            student_id=student_id,
            query=query,
            top_k=top_k,
            course_ids=course_ids,
            use_hybrid=use_hybrid,
            chapter_id=chapter_id,
            debug=debug,
            rag_profile=rag_profile,
            debug_retrieval=debug_retrieval,
            allow_web_correction=allow_web_correction,
            force_query_class=force_query_class,
        )
        return response.results

    async def retrieve_for_student_detailed(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: list[str] | None = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
        debug: bool = False,
        rag_profile: str = "",
        debug_retrieval: bool = False,
        allow_web_correction: bool = False,
        force_query_class: str = "",
    ) -> RetrievalResponse:
        if not query.strip() or not course_ids:
            return RetrievalResponse()

        normalized_query = normalize_query_for_retrieval(query)
        available_docs, available_chapters = self._collect_available_metadata(course_ids)
        retrieval_plan = build_retrieval_plan(
            query=query,
            rag_profile=rag_profile,
            force_query_class=force_query_class,
            available_docs=available_docs,
            available_chapters=available_chapters,
        )
        effective_chapter_id = chapter_id or str(retrieval_plan.metadata_filters.get("chapter_id", "") or "")
        if effective_chapter_id:
            retrieval_plan.metadata_filters["chapter_id"] = effective_chapter_id
        if not use_hybrid:
            retrieval_plan.use_hybrid = False

        cached = get_cached_retrieval_response(
            self,
            target_courses=course_ids,
            normalized_query=normalized_query,
            retrieval_plan=retrieval_plan,
            chapter_id=effective_chapter_id,
            debug=debug,
            debug_retrieval=debug_retrieval,
        )
        if cached is not None:
            return cached

        started = time.perf_counter()
        trace: list[dict[str, Any]] = []
        plan_started = time.perf_counter()
        all_queries = await self._build_query_set(normalized_query, retrieval_plan)
        trace.append(
            {
                "stage": "query_plan",
                "queries": all_queries,
                "plan": retrieval_plan.to_dict(),
                "latency_ms": round((time.perf_counter() - plan_started) * 1000, 2),
            }
        )

        candidate_lists: list[list[dict[str, Any]]] = []
        for retrieval_query in all_queries:
            stage_started = time.perf_counter()
            vector_results = await self._retrieve_vector_candidates(
                course_ids,
                retrieval_query,
                top_k=Config.RAG_HYBRID_DENSE_POOL,
                metadata_filters=retrieval_plan.metadata_filters,
                chapter_id=effective_chapter_id,
            )
            if vector_results:
                candidate_lists.append(vector_results)
                trace.append(
                    {
                        "stage": "vector",
                        "query": retrieval_query,
                        "count": len(vector_results),
                        "latency_ms": round((time.perf_counter() - stage_started) * 1000, 2),
                    }
                )

            if retrieval_plan.use_hybrid:
                sparse_started = time.perf_counter()
                sparse_bundle = await self._retrieve_sparse_candidates(
                    course_ids,
                    retrieval_query,
                    top_k=Config.RAG_HYBRID_SPARSE_POOL,
                    metadata_filters=retrieval_plan.metadata_filters,
                    chapter_id=effective_chapter_id,
                )
                sparse_results = sparse_bundle["results"]
                if sparse_results:
                    candidate_lists.append(sparse_results)
                trace.append(
                    {
                        "stage": sparse_bundle["trace_stage"],
                        "query": retrieval_query,
                        "count": len(sparse_results),
                        "latency_ms": round((time.perf_counter() - sparse_started) * 1000, 2),
                        "fallback_used": bool(sparse_bundle.get("fallback_used")),
                        "fallback_reason": sparse_bundle.get("fallback_reason", ""),
                        "source": sparse_bundle.get("source", ""),
                    }
                )

            if retrieval_plan.use_late_interaction:
                li_started = time.perf_counter()
                li_results = await self._retrieve_late_interaction_candidates(
                    course_ids,
                    retrieval_query,
                    top_k=Config.RAG_LATE_INTERACTION_TOP_K,
                    metadata_filters=retrieval_plan.metadata_filters,
                )
                if li_results:
                    candidate_lists.append(li_results)
                    trace.append(
                        {
                            "stage": "late_interaction",
                            "query": retrieval_query,
                            "count": len(li_results),
                            "latency_ms": round((time.perf_counter() - li_started) * 1000, 2),
                        }
                    )

        if not candidate_lists:
            return build_empty_response(
                target_courses=course_ids,
                normalized_query=normalized_query,
                retrieval_plan=retrieval_plan,
                chapter_id=effective_chapter_id,
                trace=trace,
                started=started,
            )

        return finalize_retrieval_response(
            self,
            target_courses=course_ids,
            normalized_query=normalized_query,
            retrieval_plan=retrieval_plan,
            chapter_id=effective_chapter_id,
            candidate_lists=candidate_lists,
            trace=trace,
            started=started,
            top_k=top_k,
            debug=debug,
            debug_retrieval=debug_retrieval,
        )

    async def _build_query_set(self, normalized_query: str, retrieval_plan) -> list[str]:
        return await build_query_set(normalized_query, retrieval_plan, logger=logger)

    async def _retrieve_vector_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> list[dict[str, Any]]:
        return await retrieve_vector_candidates(
            self,
            target_courses,
            retrieval_query,
            top_k=top_k,
            metadata_filters=metadata_filters,
            chapter_id=chapter_id,
        )

    async def _retrieve_sparse_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> dict[str, Any]:
        return await retrieve_sparse_candidates(
            self,
            target_courses,
            retrieval_query,
            top_k=top_k,
            metadata_filters=metadata_filters,
            chapter_id=chapter_id,
        )

    async def _retrieve_late_interaction_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return await retrieve_late_interaction_candidates(
            target_courses,
            retrieval_query,
            top_k=top_k,
            metadata_filters=metadata_filters,
        )

    def _vector_retrieve_one(
        self,
        course_id: str,
        retrieval_query: str,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> list[dict[str, Any]]:
        return vector_retrieve_one(self, course_id, retrieval_query, top_k, metadata_filters, chapter_id)

    def _sparse_retrieve_one(
        self,
        course_id: str,
        retrieval_query: str,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> dict[str, Any]:
        return sparse_retrieve_one(self, course_id, retrieval_query, top_k, metadata_filters, chapter_id)

    def _collect_available_metadata(self, course_ids: list[str]) -> tuple[list[str], list[str]]:
        return collect_available_metadata(self._store_manager, course_ids)

    def _build_chroma_filter(self, metadata_filters: dict[str, Any], chapter_id: str) -> dict[str, Any] | None:
        return build_chroma_filter(metadata_filters, chapter_id)

    def _metadata_filter_match(self, metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
        return metadata_filter_match(metadata, filters)

    def _token_overlap(self, query: str, text: str) -> float:
        return token_overlap(query, text)

    def _decorate_debug(self, items: list[dict[str, Any]], debug: bool) -> list[dict[str, Any]]:
        return decorate_debug(items, debug)

    def get_indexed_courses_for_student(self, student_id: str) -> list[str]:
        return self._store_manager.get_all_indexed_courses()
