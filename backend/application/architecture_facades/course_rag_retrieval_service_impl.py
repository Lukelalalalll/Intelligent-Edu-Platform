"""Retrieval workflows for course RAG."""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from backend.config import Config

from backend.services.course_rag_service.late_interaction import retrieve_with_late_interaction
from backend.services.course_rag_service.opensearch_sparse_retriever import OpenSearchSparseRetriever
from backend.services.course_rag_service.query_handler import bm25_retrieve_for_course, maybe_neural_rerank
from backend.services.course_rag_service.retrieval_evaluator import evaluate_retrieval_confidence
from backend.services.course_rag_service.retrieval_helpers import (
    build_evidence_spans,
    expand_chunk_window,
    fusion_merge,
    normalize_query_for_retrieval,
    reorder_for_llm,
    rerank_results,
)
from backend.services.course_rag_service.retrieval_planner import build_retrieval_plan
from backend.services.course_rag_service.store_manager import CourseRagStoreManager
from backend.services.course_rag_service.types import RetrievalResponse

logger = logging.getLogger(__name__)

_retrieval_pool: ThreadPoolExecutor | None = None
_retrieval_pool_lock = threading.Lock()


def _get_retrieval_pool() -> ThreadPoolExecutor:
    global _retrieval_pool
    if _retrieval_pool is not None:
        return _retrieval_pool
    with _retrieval_pool_lock:
        if _retrieval_pool is None:
            _retrieval_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="rag-retr")
        return _retrieval_pool


def shutdown_retrieval_pool() -> None:
    global _retrieval_pool
    if _retrieval_pool is not None:
        _retrieval_pool.shutdown(wait=True, cancel_futures=True)
        _retrieval_pool = None


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
        metadata_filters: Optional[dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        return bm25_retrieve_for_course(
            course_id=course_id,
            query=query,
            top_k=top_k,
            meta=self._store_manager.load_meta(course_id),
            get_store_fn=self._store_manager.get_store,
            chapter_id=chapter_id,
            metadata_filters=metadata_filters,
        )

    async def retrieve_for_student(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
        debug: bool = False,
        rag_profile: str = "",
        debug_retrieval: bool = False,
        allow_web_correction: bool = False,
        force_query_class: str = "",
    ) -> List[Dict[str, Any]]:
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
        course_ids: Optional[List[str]] = None,
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

        target_courses = course_ids
        normalized_query = normalize_query_for_retrieval(query)
        available_docs, available_chapters = self._collect_available_metadata(target_courses)
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

        from backend.services.course_rag_service.cache import get_cached_results, set_cached_results

        cached = get_cached_results(
            target_courses,
            normalized_query,
            use_hybrid=retrieval_plan.use_hybrid,
            rag_profile=retrieval_plan.retrieval_profile,
            force_query_class=retrieval_plan.query_class,
            chapter_id=effective_chapter_id,
            metadata_filters=retrieval_plan.metadata_filters,
        )
        if cached is not None:
            confidence = evaluate_retrieval_confidence(
                query=normalized_query,
                results=cached,
                metadata_filters=retrieval_plan.metadata_filters,
            )
            return RetrievalResponse(
                results=self._decorate_debug(cached, debug or debug_retrieval),
                retrieval_plan=retrieval_plan.to_dict(),
                retrieval_trace=[{"stage": "cache_hit", "count": len(cached)}],
                retrieval_confidence=confidence.to_dict(),
                fallback_reason="",
                evidence_spans=build_evidence_spans(cached),
                latency_ms=0.0,
            )

        started = time.perf_counter()
        trace: list[dict[str, Any]] = []
        plan_started = time.perf_counter()
        all_queries = await self._build_query_set(normalized_query, retrieval_plan)
        trace.append({
            "stage": "query_plan",
            "queries": all_queries,
            "plan": retrieval_plan.to_dict(),
            "latency_ms": round((time.perf_counter() - plan_started) * 1000, 2),
        })

        candidate_lists: list[list[dict[str, Any]]] = []
        for retrieval_query in all_queries:
            stage_started = time.perf_counter()
            vec_results = await self._retrieve_vector_candidates(
                target_courses,
                retrieval_query,
                top_k=Config.RAG_HYBRID_DENSE_POOL,
                metadata_filters=retrieval_plan.metadata_filters,
                chapter_id=effective_chapter_id,
            )
            if vec_results:
                candidate_lists.append(vec_results)
                trace.append({
                    "stage": "vector",
                    "query": retrieval_query,
                    "count": len(vec_results),
                    "latency_ms": round((time.perf_counter() - stage_started) * 1000, 2),
                })

            if retrieval_plan.use_hybrid:
                sparse_started = time.perf_counter()
                sparse_bundle = await self._retrieve_sparse_candidates(
                    target_courses,
                    retrieval_query,
                    top_k=Config.RAG_HYBRID_SPARSE_POOL,
                    metadata_filters=retrieval_plan.metadata_filters,
                    chapter_id=effective_chapter_id,
                )
                sparse_results = sparse_bundle["results"]
                if sparse_results:
                    candidate_lists.append(sparse_results)
                trace.append({
                    "stage": sparse_bundle["trace_stage"],
                    "query": retrieval_query,
                    "count": len(sparse_results),
                    "latency_ms": round((time.perf_counter() - sparse_started) * 1000, 2),
                    "fallback_used": bool(sparse_bundle.get("fallback_used")),
                    "fallback_reason": sparse_bundle.get("fallback_reason", ""),
                    "source": sparse_bundle.get("source", ""),
                })

            if retrieval_plan.use_late_interaction:
                li_started = time.perf_counter()
                li_results = await self._retrieve_late_interaction_candidates(
                    target_courses,
                    retrieval_query,
                    top_k=Config.RAG_LATE_INTERACTION_TOP_K,
                    metadata_filters=retrieval_plan.metadata_filters,
                )
                if li_results:
                    candidate_lists.append(li_results)
                    trace.append({
                        "stage": "late_interaction",
                        "query": retrieval_query,
                        "count": len(li_results),
                        "latency_ms": round((time.perf_counter() - li_started) * 1000, 2),
                    })

        if not candidate_lists:
            set_cached_results(
                target_courses,
                normalized_query,
                [],
                use_hybrid=retrieval_plan.use_hybrid,
                rag_profile=retrieval_plan.retrieval_profile,
                force_query_class=retrieval_plan.query_class,
                chapter_id=effective_chapter_id,
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

        fusion_started = time.perf_counter()
        fused = fusion_merge(
            candidate_lists,
            query_class=retrieval_plan.query_class,
            top_k=max(top_k * 3, Config.RAG_STAGE1_CANDIDATE_LIMIT),
        )
        trace.append({"stage": "fusion", "count": len(fused), "latency_ms": round((time.perf_counter() - fusion_started) * 1000, 2)})

        stage1_started = time.perf_counter()
        stage1 = rerank_results(
            query=normalized_query,
            items=fused,
            top_k=max(top_k * 2, Config.RAG_STAGE1_CANDIDATE_LIMIT),
        )
        trace.append({"stage": "stage1_rerank", "count": len(stage1), "latency_ms": round((time.perf_counter() - stage1_started) * 1000, 2)})

        stage2_started = time.perf_counter()
        stage2 = maybe_neural_rerank(
            normalized_query,
            stage1[: max(Config.RAG_STAGE2_CANDIDATE_LIMIT, top_k)],
            top_k=max(top_k, min(Config.RAG_STAGE2_CANDIDATE_LIMIT, len(stage1))),
        )
        trace.append({"stage": "stage2_rerank", "count": len(stage2), "latency_ms": round((time.perf_counter() - stage2_started) * 1000, 2)})

        result = stage2[:top_k]
        if Config.RAG_LOST_IN_MIDDLE_REORDER:
            reorder_started = time.perf_counter()
            result = reorder_for_llm(result)
            trace.append({"stage": "reorder_for_llm", "count": len(result), "latency_ms": round((time.perf_counter() - reorder_started) * 1000, 2)})

        confidence = evaluate_retrieval_confidence(
            query=normalized_query,
            results=result,
            metadata_filters=retrieval_plan.metadata_filters,
        )
        evidence_spans = build_evidence_spans(result)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)

        decorated = self._decorate_debug(result, debug or debug_retrieval)
        set_cached_results(
            target_courses,
            normalized_query,
            decorated,
            use_hybrid=retrieval_plan.use_hybrid,
            rag_profile=retrieval_plan.retrieval_profile,
            force_query_class=retrieval_plan.query_class,
            chapter_id=effective_chapter_id,
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

    async def _build_query_set(self, normalized_query: str, retrieval_plan) -> list[str]:
        all_queries: list[str] = [normalized_query]
        if retrieval_plan.decomposed_queries:
            for q in retrieval_plan.decomposed_queries:
                normalized = normalize_query_for_retrieval(q)
                if normalized and normalized not in all_queries:
                    all_queries.append(normalized)

        if retrieval_plan.allow_multi_query and Config.RAG_MULTI_QUERY_ENABLED:
            try:
                from .query_transforms import expand_query

                variants = await expand_query(normalized_query, n=Config.RAG_MULTI_QUERY_VARIANTS)
                for variant in variants[1:]:
                    normalized_variant = normalize_query_for_retrieval(variant)
                    if normalized_variant and normalized_variant not in all_queries:
                        all_queries.append(normalized_variant)
            except Exception:
                logger.debug("Multi-query expansion failed", exc_info=True)

        if retrieval_plan.allow_hyde and Config.RAG_HYDE_ENABLED:
            try:
                from .query_transforms import generate_hyde_query

                hyde_query = await generate_hyde_query(normalized_query)
                if hyde_query:
                    normalized_hyde = normalize_query_for_retrieval(hyde_query)
                    if normalized_hyde not in all_queries:
                        all_queries.append(normalized_hyde)
            except Exception:
                logger.debug("HyDE query generation failed", exc_info=True)
        return all_queries

    async def _retrieve_vector_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        tasks = [
            loop.run_in_executor(
                _get_retrieval_pool(),
                self._vector_retrieve_one,
                course_id,
                retrieval_query,
                top_k,
                metadata_filters,
                chapter_id,
            )
            for course_id in target_courses
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        flattened: list[dict[str, Any]] = []
        for item in results:
            if isinstance(item, list):
                flattened.extend(item)
        flattened.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
        return flattened[:top_k]

    async def _retrieve_sparse_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        tasks = [
            loop.run_in_executor(
                _get_retrieval_pool(),
                lambda cid=course_id: self._sparse_retrieve_one(
                    cid,
                    retrieval_query,
                    top_k,
                    metadata_filters,
                    chapter_id,
                ),
            )
            for course_id in target_courses
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        flattened: list[dict[str, Any]] = []
        source_tags: set[str] = set()
        fallback_reasons: set[str] = set()
        fallback_used = False
        for item in results:
            if not isinstance(item, dict):
                continue
            flattened.extend(item.get("results") or [])
            source = str(item.get("source") or "")
            if source:
                source_tags.add(source)
            reason = str(item.get("fallback_reason") or "")
            if reason:
                fallback_reasons.add(reason)
            fallback_used = fallback_used or bool(item.get("fallback_used"))
        flattened.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
        if "opensearch_sparse" in source_tags:
            trace_stage = "opensearch_sparse"
            source = "opensearch_sparse"
        else:
            trace_stage = "bm25"
            source = "bm25"
        return {
            "results": flattened[:top_k],
            "trace_stage": trace_stage,
            "source": source,
            "fallback_used": fallback_used,
            "fallback_reason": ",".join(sorted(fallback_reasons)),
        }

    async def _retrieve_late_interaction_candidates(
        self,
        target_courses: list[str],
        retrieval_query: str,
        *,
        top_k: int,
        metadata_filters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for course_id in target_courses:
            results.extend(
                await retrieve_with_late_interaction(
                    course_id=course_id,
                    query=retrieval_query,
                    top_k=top_k,
                    metadata_filters=metadata_filters,
                )
            )
        results.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
        return results[:top_k]

    def _vector_retrieve_one(
        self,
        course_id: str,
        retrieval_query: str,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        try:
            course_meta = self._store_manager.load_meta(course_id)
            docs_meta = course_meta.get("documents", {})
            doc_chapter_map = {str(name): str(info.get("chapter_id") or "") for name, info in docs_meta.items()}
            store = self._store_manager.get_store(course_id)
            chroma_filter = self._build_chroma_filter(metadata_filters, chapter_id)
            kwargs = {"query": retrieval_query, "k": max(1, top_k)}
            if chroma_filter:
                kwargs["filter"] = chroma_filter
            docs_with_scores = store.similarity_search_with_score(**kwargs)
            for rank, (doc, distance) in enumerate(docs_with_scores, start=1):
                similarity = max(0.0, 1.0 - float(distance))
                if similarity < Config.RAG_VECTOR_SIMILARITY_THRESHOLD:
                    continue
                md = doc.metadata or {}
                doc_name = md.get("doc_name", "")
                node_type = str(md.get("node_type", "leaf_chunk") or "leaf_chunk")
                if node_type not in {"leaf_chunk", "table_chunk", "section_summary"}:
                    continue
                doc_chapter = md.get("chapter_id", "") or doc_chapter_map.get(str(doc_name), "")
                if chapter_id and str(doc_chapter or "") != chapter_id:
                    continue
                if not self._metadata_filter_match(md, metadata_filters):
                    continue
                result_item: Dict[str, Any] = {
                    "course_id": course_id,
                    "text": doc.page_content,
                    "score": round(similarity, 4),
                    "raw_vector_score": round(similarity, 4),
                    "retrieval_score": round(similarity, 4),
                    "dense_score": round(similarity, 4),
                    "doc_name": doc_name,
                    "chapter_id": doc_chapter,
                    "section_title": md.get("section_title", ""),
                    "section_path": md.get("section_path", ""),
                    "heading_path": md.get("heading_path", md.get("section_path", "")),
                    "page_num": md.get("page_num", -1),
                    "page_start": md.get("page_start", md.get("page_num", -1)),
                    "page_end": md.get("page_end", md.get("page_num", -1)),
                    "chunk_id": md.get("chunk_id", -1),
                    "node_type": node_type,
                    "element_type": md.get("element_type", "paragraph"),
                    "parser_used": md.get("parser_used", ""),
                    "token_count": md.get("token_count", 0),
                    "index_version": md.get("index_version", ""),
                    "retrieval_sources": ["vector"],
                    "source_rank": rank,
                    "title_overlap": self._token_overlap(retrieval_query, md.get("section_title", "") or doc_name),
                    "heading_overlap": self._token_overlap(retrieval_query, md.get("heading_path", md.get("section_path", ""))),
                    "filter_match": 1.0 if metadata_filters else 0.0,
                }
                if Config.RAG_PARENT_EXPANSION_ENABLED:
                    result_item = expand_chunk_window(
                        result_item,
                        store,
                        window=Config.RAG_PARENT_EXPANSION_WINDOW,
                    )
                    if result_item.get("parent_expanded"):
                        result_item["retrieval_sources"] = sorted(set(result_item.get("retrieval_sources", [])) | {"vector_expanded"})
                results.append(result_item)
        except BaseException:
            logger.debug("Could not retrieve from course %s", course_id, exc_info=True)
        return results

    def _sparse_retrieve_one(
        self,
        course_id: str,
        retrieval_query: str,
        top_k: int,
        metadata_filters: dict[str, Any],
        chapter_id: str,
    ) -> dict[str, Any]:
        effective_filters = dict(metadata_filters or {})
        if chapter_id:
            effective_filters.setdefault("chapter_id", chapter_id)

        os_result = self._opensearch_sparse.retrieve_with_status(
            course_id=course_id,
            query=retrieval_query,
            top_k=top_k,
            metadata_filters=effective_filters,
        )
        if os_result.get("status") == "ok":
            return {
                "results": os_result.get("results") or [],
                "source": "opensearch_sparse",
                "fallback_used": False,
                "fallback_reason": "",
            }

        bm25_results = self._bm25_retrieve(
            course_id,
            retrieval_query,
            top_k,
            chapter_id=chapter_id,
            metadata_filters=effective_filters,
        )
        return {
            "results": bm25_results,
            "source": "bm25",
            "fallback_used": True,
            "fallback_reason": str(os_result.get("status") or "unknown"),
        }

    def _collect_available_metadata(self, course_ids: list[str]) -> tuple[list[str], list[str]]:
        docs: list[str] = []
        chapters: list[str] = []
        for course_id in course_ids:
            meta = self._store_manager.load_meta(course_id)
            for doc_name, info in meta.get("documents", {}).items():
                docs.append(str(doc_name))
                chapter = str(info.get("chapter_id") or "")
                if chapter and chapter not in chapters:
                    chapters.append(chapter)
        return docs, chapters

    def _build_chroma_filter(self, metadata_filters: dict[str, Any], chapter_id: str) -> dict[str, Any] | None:
        filters = dict(metadata_filters or {})
        if chapter_id:
            filters["chapter_id"] = chapter_id
        if not filters:
            return None
        clauses = []
        for key, value in filters.items():
            if key in {"page_start", "page_end"}:
                continue
            clauses.append({key: value})
        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    def _metadata_filter_match(self, metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
        if not filters:
            return True
        for key, value in filters.items():
            if key in {"page_start", "page_end"}:
                md_page = int(metadata.get(key, metadata.get("page_num", -1)) or -1)
                if md_page != int(value):
                    return False
                continue
            if str(metadata.get(key, "") or "") != str(value):
                return False
        return True

    def _token_overlap(self, query: str, text: str) -> float:
        from backend.services.course_rag_service.retrieval_helpers import tokenize_for_rerank

        query_tokens = tokenize_for_rerank(query)
        text_tokens = tokenize_for_rerank(text)
        return round(len(query_tokens & text_tokens) / max(1, len(query_tokens)), 4)

    def _decorate_debug(self, items: list[dict[str, Any]], debug: bool) -> list[dict[str, Any]]:
        if not debug:
            return items
        decorated: list[dict[str, Any]] = []
        for item in items:
            enriched = dict(item)
            enriched.setdefault("active_index_version", enriched.get("index_version", ""))
            enriched.setdefault("rerank_score", enriched.get("score", 0.0))
            decorated.append(enriched)
        return decorated

    def get_indexed_courses_for_student(self, student_id: str) -> List[str]:
        return self._store_manager.get_all_indexed_courses()
