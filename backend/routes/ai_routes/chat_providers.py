"""Provider strategies for the /chat endpoint.

Each strategy encapsulates:
  1. Generating the LLM answer (streaming where possible).
  2. Post-check / downgrade.
  3. Truncation-continuation.
  4. Yielding SSE frames.
"""

from __future__ import annotations

import logging
import time
from typing import AsyncIterator

from backend.config import Config
from backend.services.local_llm_service import LocalLLMUnavailableError
from backend.services.rag_chat_pipeline import postcheck_and_downgrade, task_profile_for_phase

from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_streaming import SSE_DONE, sse_delta, sse_meta, stream_text_as_sse
from .chat_telemetry import record_chat_telemetry
from .chat_context_helpers import (
    _compact_chat_history,
    _looks_truncated_response,
    _sanitize_answer_text,
)

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────
_CONTINUATION_HISTORY_TAIL = 3000
_CONTINUATION_PROMPT = (
    "Continue your previous answer from the exact unfinished point. "
    "Do not restart or repeat prior content. "
    "Finish with a complete ending sentence."
)
_NO_RESPONSE_PLACEHOLDER = "No response content."


def _build_p0_telemetry_extra(req: ParsedRequest, rag: RAGResult) -> dict[str, object]:
    history_turns = max(0, len(rag.compact_history) // 2)
    rewrite_applied = (str(rag.rag_rewritten_query or "").strip() != str(req.effective_question or "").strip())
    denom = max(1, int(rag.rag_top_k or 1))
    topk_hit_rate = round(min(len(rag.rag_citations), denom) / denom, 4)
    return {
        "history_turns_used": history_turns,
        "rewrite_applied": rewrite_applied,
        "topk_hit_rate": topk_hit_rate,
        "session_id_present": bool(req.session_id),
        "session_backfilled": bool(req.session_backfilled),
    }


# ── Local Ollama strategy ──────────────────────────────────────────

async def _generate_via_local_ollama(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Attempt generation with the local Ollama model.

    Raises ``LocalLLMUnavailableError`` if the model is unreachable so the
    caller can fall through to the Coze fallback.
    """
    from backend.services.local_llm_service import LocalLLMService

    local_svc = LocalLLMService()
    is_healthy, health_msg = await local_svc.health_check()
    if not is_healthy:
        raise LocalLLMUnavailableError(f"Health check failed: {health_msg}")

    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    # ── Generate answer ──
    postcheck_downgraded = 0
    if req.is_student and Config.RAG_POSTCHECK_ENABLED:
        # Need full answer for postcheck — use non-streaming
        full_answer = await local_svc.chat(req.latest_user_message, context)
        answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

        full_answer, postcheck_downgraded = postcheck_and_downgrade(
            answer=full_answer,
            evidence_cards=rag.rag_citations,
        )
        full_answer = _sanitize_answer_text(full_answer)

        async for frame in stream_text_as_sse(full_answer, chunk_size=2, delay=0.01):
            yield frame
    else:
        # True streaming — yield chunks as they arrive
        streamed_parts: list[str] = []
        async for chunk in local_svc.chat_stream(req.latest_user_message, context):
            streamed_parts.append(chunk)
            yield sse_delta(chunk)
        full_answer = "".join(streamed_parts)
        answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

    # ── Truncation continuation ──
    if _looks_truncated_response(full_answer):
        continuation_meta = {
            "provider": "local_ollama",
            "warning": "Detected possible truncation; auto-continuing once.",
        }
        yield sse_meta(continuation_meta)

        continuation_history = _compact_chat_history(req.cleaned_messages[:-1]) + [
            {"role": "user", "content": req.latest_user_message},
            {"role": "assistant", "content": full_answer[-_CONTINUATION_HISTORY_TAIL:]},
        ]
        continuation_context = dict(context)
        continuation_context["chat_history"] = continuation_history
        continuation_context["task_profile"] = task_profile_for_phase("answer")

        async for chunk in local_svc.chat_stream(_CONTINUATION_PROMPT, continuation_context):
            yield sse_delta(chunk)

    # ── Telemetry ──
    await record_chat_telemetry(
        user_id=req.user_id,
        role=req.role,
        is_student=req.is_student,
        course_ids=rag.student_course_ids,
        query=req.latest_user_message,
        rag_citations=rag.rag_citations,
        rag_retrieval_latency_ms=rag.rag_retrieval_latency_ms,
        rag_retrieve_top_n=rag.rag_retrieve_top_n,
        rag_retry_used=rag.rag_retry_used,
        rag_retry_success=rag.rag_retry_success,
        rag_empty_after_retry=rag.rag_empty_after_retry,
        answer_latency_ms=answer_latency_ms,
        postcheck_downgraded=postcheck_downgraded,
        phase="answer",
        extra=_build_p0_telemetry_extra(req, rag),
    )

    yield SSE_DONE


# ── Coze (cloud) strategy ──────────────────────────────────────────

async def _generate_via_coze(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Generate the answer via the Coze cloud provider."""
    from .router import ai_gateway_service

    answer_t0 = time.perf_counter()
    reply = await ai_gateway_service.chat_with_provider(
        message=req.latest_user_message,
        context=context,
        provider="coze",
    )
    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

    postcheck_downgraded = 0
    if req.is_student and Config.RAG_POSTCHECK_ENABLED:
        reply, postcheck_downgraded = postcheck_and_downgrade(
            answer=reply, evidence_cards=rag.rag_citations,
        )
        meta.postcheck_downgraded = postcheck_downgraded

    reply = _sanitize_answer_text(reply)

    # Telemetry
    phase = "answer_fallback_coze" if meta.fallback_from else "answer_coze"
    await record_chat_telemetry(
        user_id=req.user_id,
        role=req.role,
        is_student=req.is_student,
        course_ids=rag.student_course_ids,
        query=req.latest_user_message,
        rag_citations=rag.rag_citations,
        rag_retrieval_latency_ms=rag.rag_retrieval_latency_ms,
        rag_retrieve_top_n=rag.rag_retrieve_top_n,
        rag_retry_used=rag.rag_retry_used,
        rag_retry_success=rag.rag_retry_success,
        rag_empty_after_retry=rag.rag_empty_after_retry,
        answer_latency_ms=answer_latency_ms,
        postcheck_downgraded=postcheck_downgraded,
        phase=phase,
        extra=_build_p0_telemetry_extra(req, rag),
    )

    yield sse_meta(meta.to_dict())

    if not reply:
        yield sse_delta(_NO_RESPONSE_PLACEHOLDER)
    else:
        async for frame in stream_text_as_sse(reply, chunk_size=2, delay=0.01):
            yield frame

    yield SSE_DONE


# ── Insufficient-evidence early return ─────────────────────────────

async def _generate_forced_response(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
) -> AsyncIterator[str]:
    """Emit a pre-built forced response (e.g. insufficient evidence)."""
    meta.warning = "insufficient_evidence"
    yield sse_meta(meta.to_dict())

    async for frame in stream_text_as_sse(rag.forced_response_message, chunk_size=2, delay=0.01):
        yield frame

    yield SSE_DONE

    await record_chat_telemetry(
        user_id=req.user_id,
        role=req.role,
        is_student=req.is_student,
        course_ids=rag.student_course_ids,
        query=req.latest_user_message,
        rag_citations=rag.rag_citations,
        rag_retrieval_latency_ms=rag.rag_retrieval_latency_ms,
        rag_retrieve_top_n=rag.rag_retrieve_top_n,
        rag_retry_used=rag.rag_retry_used,
        rag_retry_success=rag.rag_retry_success,
        rag_empty_after_retry=True,
        answer_latency_ms=0,
        postcheck_downgraded=0,
        phase="insufficient_evidence",
        extra=_build_p0_telemetry_extra(req, rag),
    )


# ── Public dispatcher ──────────────────────────────────────────────

async def generate_chat_response(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Top-level generator: routes to the correct provider strategy.

    Handles the local→coze fallback transparently.
    """
    # 1. RAG found nothing? Continue — LLM answers without evidence context.

    # 2. Local Ollama (with fallback to Coze)
    if meta.provider == "local_ollama":
        try:
            async for frame in _generate_via_local_ollama(req, rag, meta, context):
                yield frame
            return
        except LocalLLMUnavailableError as exc:
            logger.warning("Local Ollama unavailable, fallback to Coze: %s", exc)
            meta.provider = "coze"
            meta.fallback_from = "local_ollama"
            meta.fallback_to = "coze"
            meta.warning = f"Local model unavailable: {exc}"
            # fall through to Coze

    # 3. Coze (or fallback)
    async for frame in _generate_via_coze(req, rag, meta, context):
        yield frame
