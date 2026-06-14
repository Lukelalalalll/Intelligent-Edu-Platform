"""Optional late-interaction retrieval channel."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from backend.config import Config

logger = logging.getLogger(__name__)


async def retrieve_with_late_interaction(
    *,
    course_id: str,
    query: str,
    top_k: int,
    metadata_filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    endpoint = str(Config.RAG_COLBERT_ENDPOINT or "").strip()
    if not endpoint:
        return []

    payload = {
        "course_id": course_id,
        "query": query,
        "top_k": top_k,
        "filters": metadata_filters or {},
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(endpoint, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception:
        logger.debug("Late interaction retrieval unavailable", exc_info=True)
        return []

    results = data.get("results") or []
    normalized: list[dict[str, Any]] = []
    for item in results:
        entry = dict(item or {})
        entry.setdefault("course_id", course_id)
        entry.setdefault("retrieval_sources", ["late_interaction"])
        if entry.get("score") is None and entry.get("retrieval_score") is not None:
            entry["score"] = entry["retrieval_score"]
        normalized.append(entry)
    return normalized
