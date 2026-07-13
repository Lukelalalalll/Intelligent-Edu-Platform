"""Unified telemetry recording for the /chat endpoint."""

from __future__ import annotations

import logging
from typing import Any

from backend.infrastructure.rag_telemetry import rag_telemetry

logger = logging.getLogger(__name__)


async def record_chat_telemetry(
    *,
    user_id: str,
    role: str,
    is_student: bool,
    course_ids: list[str],
    query: str,
    rag_citations: list[dict],
    rag_retrieval_latency_ms: float,
    rag_retrieve_top_n: int,
    rag_retry_used: bool,
    rag_retry_success: bool,
    rag_empty_after_retry: bool,
    answer_latency_ms: float = 0.0,
    postcheck_downgraded: int = 0,
    phase: str = "answer",
    extra: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget telemetry recording; never raises."""
    try:
        metadata: dict[str, Any] = {
            "retry_used": rag_retry_used,
            "retry_success": rag_retry_success,
            "empty_after_retry": rag_empty_after_retry,
            "answer_latency_ms": answer_latency_ms,
            "postcheck_downgraded": postcheck_downgraded,
            "phase": phase,
        }
        if extra:
            metadata.update(extra)

        await rag_telemetry.record(
            user_id=user_id,
            role="student" if is_student else role,
            course_ids=course_ids,
            query=query,
            result_count=len(rag_citations),
            latency_ms=rag_retrieval_latency_ms,
            use_hybrid=True,
            top_k=rag_retrieve_top_n,
            metadata=metadata,
        )
    except Exception:
        logger.exception("Failed to record chat telemetry (phase=%s)", phase)
