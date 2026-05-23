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
from backend.services.llm_service.local_llm_service import LocalLLMUnavailableError
from backend.services.rag_service.rag_chat_pipeline import postcheck_and_downgrade, task_profile_for_phase

from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_streaming import SSE_DONE, sse_delta, sse_meta, sse_think, sse_answer, stream_text_as_sse
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
    from backend.services.llm_service.local_llm_service import LocalLLMService

    local_svc = LocalLLMService()
    is_healthy, health_msg = await local_svc.health_check()
    if not is_healthy:
        raise LocalLLMUnavailableError(f"Health check failed: {health_msg}")

    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    # ── Generate answer via streaming ReAct agent ──
    from backend.agent.react_agent import ReActAgent
    import json

    agent = ReActAgent(local_svc)
    full_answer = ""

    # Stream tool_progress, ui_element, and content deltas in real-time
    async for frame in agent.run_stream(
        user_message=req.latest_user_message,
        chat_history=req.cleaned_messages[:-1],
        context=context,
    ):
        # Pass through all SSE frames directly (tool_progress, ui_element, deltas)
        yield frame

    # Collect the final answer from the agent result
    if hasattr(agent, '_last_result'):
        full_answer = agent._last_result.answer or "Action completed."
    else:
        full_answer = "Action completed."

    postcheck_downgraded = 0
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
    """Generate the answer via the Coze cloud provider.

    When post-check is enabled for students, buffers the full response first
    so downgrades are applied BEFORE any token reaches the client.
    Otherwise streams directly for lower latency.
    """
    from .router import ai_gateway_service

    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    needs_postcheck = req.is_student and Config.RAG_POSTCHECK_ENABLED

    full_answer_parts: list[str] = []
    try:
        async for token in ai_gateway_service.chat_stream_with_provider(
            message=req.latest_user_message,
            context=context,
            provider="coze",
        ):
            full_answer_parts.append(token)
            if not needs_postcheck:
                yield sse_delta(token)
    except Exception as exc:
        logger.warning("Coze streaming failed: %s", exc)
        yield sse_delta(f"Coze error: {str(exc)[:200]}")
        yield SSE_DONE
        return

    full_answer = "".join(full_answer_parts)
    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

    postcheck_downgraded = 0
    if needs_postcheck:
        full_answer, postcheck_downgraded = postcheck_and_downgrade(
            answer=full_answer, evidence_cards=rag.rag_citations,
        )
        meta.postcheck_downgraded = postcheck_downgraded

    full_answer = _sanitize_answer_text(full_answer)

    # If we buffered (post-check enabled), stream the corrected answer now
    if needs_postcheck and full_answer_parts:
        # Stream the corrected answer in chunks for a natural feel
        corrected = full_answer
        chunk_size = 24
        for i in range(0, len(corrected), chunk_size):
            yield sse_delta(corrected[i:i + chunk_size])

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


# ── DeepSeek strategy ──────────────────────────────────────────────

async def _generate_via_deepseek(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Generate the answer via the DeepSeek cloud provider (streaming)."""
    from backend.services.llm_service.deepseek_service import DeepSeekService, DeepSeekUnavailableError

    deepseek = DeepSeekService()
    answer_t0 = time.perf_counter()

    yield sse_meta(meta.to_dict())

    full_answer_parts: list[str] = []
    try:
        if req.enable_thinking:
            # Use structured reasoning stream — emits think/answer deltas
            async for chunk_dict in deepseek.chat_stream_structured(
                message=req.latest_user_message,
                context=context,
            ):
                chunk_type = chunk_dict.get("type", "answer")
                chunk_content = chunk_dict.get("content", "")
                if chunk_type == "think":
                    yield sse_think(chunk_content)
                else:
                    full_answer_parts.append(chunk_content)
                    yield sse_answer(chunk_content)
        else:
            async for chunk in deepseek.chat_stream(
                message=req.latest_user_message,
                context=context,
                enable_thinking=req.enable_thinking,
            ):
                full_answer_parts.append(chunk)
                yield sse_delta(chunk)
    except DeepSeekUnavailableError as exc:
        logger.warning("DeepSeek unavailable: %s", exc)
        meta.provider = "coze"
        meta.fallback_from = "deepseek"
        meta.fallback_to = "coze"
        meta.warning = f"DeepSeek unavailable, fallback to Coze: {exc}"
        async for frame in _generate_via_coze(req, rag, meta, context):
            yield frame
        return

    full_answer = "".join(full_answer_parts)
    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)

    postcheck_downgraded = 0
    if req.is_student and Config.RAG_POSTCHECK_ENABLED:
        from backend.services.rag_service.rag_chat_pipeline import postcheck_and_downgrade
        full_answer, postcheck_downgraded = postcheck_and_downgrade(
            answer=full_answer, evidence_cards=rag.rag_citations,
        )
        meta.postcheck_downgraded = postcheck_downgraded

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
        phase="answer_deepseek",
        extra=_build_p0_telemetry_extra(req, rag),
    )

    yield SSE_DONE


# ── Public dispatcher ──────────────────────────────────────────────

async def generate_chat_response(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Top-level generator: routes to the correct provider strategy.

    Handles the local→coze and deepseek→coze fallback transparently.
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

    # 3. DeepSeek (with fallback to Coze)
    if meta.provider == "deepseek":
        try:
            async for frame in _generate_via_deepseek(req, rag, meta, context):
                yield frame
            return
        except Exception as exc:
            logger.warning("DeepSeek unavailable, fallback to Coze: %s", exc)
            meta.provider = "coze"
            meta.fallback_from = "deepseek"
            meta.fallback_to = "coze"
            meta.warning = f"DeepSeek unavailable: {exc}"
            # fall through to Coze

    # 4. Coze (or fallback)
    async for frame in _generate_via_coze(req, rag, meta, context):
        yield frame
