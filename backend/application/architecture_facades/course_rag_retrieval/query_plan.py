from __future__ import annotations

import logging
from typing import Any

from backend.config import Config
from backend.services.course_rag_service.query_transforms import expand_query, generate_hyde_query
from backend.services.course_rag_service.retrieval_helpers import normalize_query_for_retrieval


def collect_available_metadata(store_manager, course_ids: list[str]) -> tuple[list[str], list[str]]:
    docs: list[str] = []
    chapters: list[str] = []
    for course_id in course_ids:
        meta = store_manager.load_meta(course_id)
        for doc_name, info in meta.get("documents", {}).items():
            docs.append(str(doc_name))
            chapter = str(info.get("chapter_id") or "")
            if chapter and chapter not in chapters:
                chapters.append(chapter)
    return docs, chapters


async def build_query_set(
    normalized_query: str,
    retrieval_plan: Any,
    *,
    logger: logging.Logger,
) -> list[str]:
    all_queries: list[str] = [normalized_query]
    if retrieval_plan.decomposed_queries:
        for query in retrieval_plan.decomposed_queries:
            normalized = normalize_query_for_retrieval(query)
            if normalized and normalized not in all_queries:
                all_queries.append(normalized)

    if retrieval_plan.allow_multi_query and Config.RAG_MULTI_QUERY_ENABLED:
        try:
            variants = await expand_query(normalized_query, n=Config.RAG_MULTI_QUERY_VARIANTS)
            for variant in variants[1:]:
                normalized_variant = normalize_query_for_retrieval(variant)
                if normalized_variant and normalized_variant not in all_queries:
                    all_queries.append(normalized_variant)
        except Exception:
            logger.debug("Multi-query expansion failed", exc_info=True)

    if retrieval_plan.allow_hyde and Config.RAG_HYDE_ENABLED:
        try:
            hyde_query = await generate_hyde_query(normalized_query)
            if hyde_query:
                normalized_hyde = normalize_query_for_retrieval(hyde_query)
                if normalized_hyde not in all_queries:
                    all_queries.append(normalized_hyde)
        except Exception:
            logger.debug("HyDE query generation failed", exc_info=True)
    return all_queries
