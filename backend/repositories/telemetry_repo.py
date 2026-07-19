from __future__ import annotations

from typing import Any

from backend.core.database import db

LLM_COLLECTION = "llm_telemetry"
RAG_COLLECTION = "rag_telemetry"


async def insert_llm(document: dict[str, Any]):
    return await db[LLM_COLLECTION].insert_one(document)


async def insert_rag(document: dict[str, Any]):
    return await db[RAG_COLLECTION].insert_one(document)


async def aggregate_llm(pipeline: list[dict[str, Any]], *, length: int = 100) -> list[dict[str, Any]]:
    return await db[LLM_COLLECTION].aggregate(pipeline).to_list(length)


async def aggregate_rag(pipeline: list[dict[str, Any]], *, length: int = 100) -> list[dict[str, Any]]:
    return await db[RAG_COLLECTION].aggregate(pipeline).to_list(length)


async def find_llm(
    query: dict[str, Any],
    projection: dict[str, Any] | None = None,
    *,
    sort: str | list[tuple[str, int]] | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    cursor = db[LLM_COLLECTION].find(query, projection)
    if sort:
        cursor = cursor.sort(sort if isinstance(sort, list) else [(sort, -1)])
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(limit or 0)
