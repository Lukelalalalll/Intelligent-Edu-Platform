from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.config import Config
from backend.services.course_rag_service.late_interaction import retrieve_with_late_interaction
from backend.services.course_rag_service.query_handler import bm25_retrieve_for_course
from backend.services.course_rag_service.retrieval_helpers import expand_chunk_window, tokenize_for_rerank

from .pool import get_retrieval_pool

logger = logging.getLogger(__name__)


def bm25_retrieve(
    store_manager,
    course_id: str,
    query: str,
    top_k: int,
    *,
    chapter_id: str = "",
    metadata_filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    return bm25_retrieve_for_course(
        course_id=course_id,
        query=query,
        top_k=top_k,
        meta=store_manager.load_meta(course_id),
        get_store_fn=store_manager.get_store,
        chapter_id=chapter_id,
        metadata_filters=metadata_filters,
    )


async def retrieve_vector_candidates(
    service,
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
            get_retrieval_pool(),
            service._vector_retrieve_one,
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
    flattened.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
    return flattened[:top_k]


async def retrieve_sparse_candidates(
    service,
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
            get_retrieval_pool(),
            lambda cid=course_id: service._sparse_retrieve_one(
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
    flattened.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
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


async def retrieve_late_interaction_candidates(
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
    results.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
    return results[:top_k]


def vector_retrieve_one(
    service,
    course_id: str,
    retrieval_query: str,
    top_k: int,
    metadata_filters: dict[str, Any],
    chapter_id: str,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    try:
        course_meta = service._store_manager.load_meta(course_id)
        docs_meta = course_meta.get("documents", {})
        doc_chapter_map = {str(name): str(info.get("chapter_id") or "") for name, info in docs_meta.items()}
        store = service._store_manager.get_store(course_id)
        chroma_filter = service._build_chroma_filter(metadata_filters, chapter_id)
        kwargs = {"query": retrieval_query, "k": max(1, top_k)}
        if chroma_filter:
            kwargs["filter"] = chroma_filter
        docs_with_scores = store.similarity_search_with_score(**kwargs)
        for rank, (doc, distance) in enumerate(docs_with_scores, start=1):
            similarity = max(0.0, 1.0 - float(distance))
            if similarity < Config.RAG_VECTOR_SIMILARITY_THRESHOLD:
                continue
            metadata = doc.metadata or {}
            doc_name = metadata.get("doc_name", "")
            node_type = str(metadata.get("node_type", "leaf_chunk") or "leaf_chunk")
            if node_type not in {"leaf_chunk", "table_chunk", "section_summary"}:
                continue
            doc_chapter = metadata.get("chapter_id", "") or doc_chapter_map.get(str(doc_name), "")
            if chapter_id and str(doc_chapter or "") != chapter_id:
                continue
            if not service._metadata_filter_match(metadata, metadata_filters):
                continue
            result_item: dict[str, Any] = {
                "course_id": course_id,
                "text": doc.page_content,
                "score": round(similarity, 4),
                "raw_vector_score": round(similarity, 4),
                "retrieval_score": round(similarity, 4),
                "dense_score": round(similarity, 4),
                "doc_name": doc_name,
                "chapter_id": doc_chapter,
                "section_title": metadata.get("section_title", ""),
                "section_path": metadata.get("section_path", ""),
                "heading_path": metadata.get("heading_path", metadata.get("section_path", "")),
                "page_num": metadata.get("page_num", -1),
                "page_start": metadata.get("page_start", metadata.get("page_num", -1)),
                "page_end": metadata.get("page_end", metadata.get("page_num", -1)),
                "chunk_id": metadata.get("chunk_id", -1),
                "node_type": node_type,
                "element_type": metadata.get("element_type", "paragraph"),
                "parser_used": metadata.get("parser_used", ""),
                "token_count": metadata.get("token_count", 0),
                "index_version": metadata.get("index_version", ""),
                "retrieval_sources": ["vector"],
                "source_rank": rank,
                "title_overlap": service._token_overlap(retrieval_query, metadata.get("section_title", "") or doc_name),
                "heading_overlap": service._token_overlap(
                    retrieval_query,
                    metadata.get("heading_path", metadata.get("section_path", "")),
                ),
                "filter_match": 1.0 if metadata_filters else 0.0,
            }
            if Config.RAG_PARENT_EXPANSION_ENABLED:
                result_item = expand_chunk_window(
                    result_item,
                    store,
                    window=Config.RAG_PARENT_EXPANSION_WINDOW,
                )
                if result_item.get("parent_expanded"):
                    result_item["retrieval_sources"] = sorted(
                        set(result_item.get("retrieval_sources", [])) | {"vector_expanded"}
                    )
            results.append(result_item)
    except BaseException:
        logger.debug("Could not retrieve from course %s", course_id, exc_info=True)
    return results


def sparse_retrieve_one(
    service,
    course_id: str,
    retrieval_query: str,
    top_k: int,
    metadata_filters: dict[str, Any],
    chapter_id: str,
) -> dict[str, Any]:
    effective_filters = dict(metadata_filters or {})
    if chapter_id:
        effective_filters.setdefault("chapter_id", chapter_id)

    opensearch_result = service._opensearch_sparse.retrieve_with_status(
        course_id=course_id,
        query=retrieval_query,
        top_k=top_k,
        metadata_filters=effective_filters,
    )
    if opensearch_result.get("status") == "ok":
        return {
            "results": opensearch_result.get("results") or [],
            "source": "opensearch_sparse",
            "fallback_used": False,
            "fallback_reason": "",
        }

    bm25_results = service._bm25_retrieve(
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
        "fallback_reason": str(opensearch_result.get("status") or "unknown"),
    }


def build_chroma_filter(metadata_filters: dict[str, Any], chapter_id: str) -> dict[str, Any] | None:
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


def metadata_filter_match(metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
    if not filters:
        return True
    for key, value in filters.items():
        if key in {"page_start", "page_end"}:
            metadata_page = int(metadata.get(key, metadata.get("page_num", -1)) or -1)
            if metadata_page != int(value):
                return False
            continue
        if str(metadata.get(key, "") or "") != str(value):
            return False
    return True


def token_overlap(query: str, text: str) -> float:
    query_tokens = tokenize_for_rerank(query)
    text_tokens = tokenize_for_rerank(text)
    return round(len(query_tokens & text_tokens) / max(1, len(query_tokens)), 4)
