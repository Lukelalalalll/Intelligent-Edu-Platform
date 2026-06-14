"""Provider strategies for the /chat endpoint."""

from __future__ import annotations

import logging
import time
from typing import AsyncIterator

from backend.config import Config
from backend.core.dependencies import get_ai_gateway_service
from backend.services.llm_service.local_llm_service import LocalLLMUnavailableError
from backend.services.rag_service.rag_chat_pipeline import (
    postcheck_and_downgrade,
    task_profile_for_phase,
)

from .chat_context_helpers import (
    _compact_chat_history,
    _looks_truncated_response,
    _sanitize_answer_text,
)
from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_streaming import (
    SSE_DONE,
    sse_answer,
    sse_delta,
    sse_meta,
    sse_think,
    stream_text_as_sse,
)
from .chat_telemetry import record_chat_telemetry

logger = logging.getLogger(__name__)

_AI_GATEWAY_SERVICE = get_ai_gateway_service()
_CONTINUATION_HISTORY_TAIL = 3000
_CONTINUATION_PROMPT = (
    "Continue your previous answer from the exact unfinished point. "
    "Do not restart or repeat prior content. "
    "Finish with a complete ending sentence."
)
_NO_RESPONSE_PLACEHOLDER = "No response content."


def _build_p0_telemetry_extra(req: ParsedRequest, rag: RAGResult) -> dict[str, object]:
    history_turns = max(0, len(rag.compact_history) // 2)
    rewrite_applied = (
        str(rag.rag_rewritten_query or "").strip()
        != str(req.effective_question or "").strip()
    )
    denom = max(1, int(rag.rag_top_k or 1))
    topk_hit_rate = round(min(len(rag.rag_citations), denom) / denom, 4)
    return {
        "history_turns_used": history_turns,
        "rewrite_applied": rewrite_applied,
        "topk_hit_rate": topk_hit_rate,
        "session_id_present": bool(req.session_id),
        "session_backfilled": bool(req.session_backfilled),
    }


def _needs_postcheck(req: ParsedRequest) -> bool:
    return req.is_student and Config.RAG_POSTCHECK_ENABLED


def _phase_name(provider: str, meta: StreamMeta) -> str:
    return f"answer_fallback_{provider}" if meta.fallback_from else f"answer_{provider}"


def _finalize_answer_text(
    *,
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    answer: str,
) -> tuple[str, int]:
    final_answer = str(answer or "").strip() or _NO_RESPONSE_PLACEHOLDER
    postcheck_downgraded = 0
    if _needs_postcheck(req):
        final_answer, postcheck_downgraded = postcheck_and_downgrade(
            answer=final_answer,
            evidence_cards=rag.rag_citations,
        )
        meta.postcheck_downgraded = postcheck_downgraded
    return _sanitize_answer_text(final_answer), postcheck_downgraded


async def _stream_buffered_answer(
    answer: str,
    *,
    chunk_size: int = 24,
    answer_frame: str = "delta",
) -> AsyncIterator[str]:
    if answer_frame == "answer":
        for i in range(0, len(answer), chunk_size):
            yield sse_answer(answer[i:i + chunk_size])
        return

    async for frame in stream_text_as_sse(answer, chunk_size=chunk_size, delay=0.0):
        yield frame


async def _generate_via_local_ollama(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Generate the answer with the local Ollama provider."""
    from backend.services.llm_service.local_llm_service import LocalLLMService

    local_svc = LocalLLMService()
    is_healthy, health_msg = await local_svc.health_check()
    if not is_healthy:
        raise LocalLLMUnavailableError(f"Health check failed: {health_msg}")

    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    should_buffer = _needs_postcheck(req)
    full_answer_parts: list[str] = []
    if should_buffer:
        full_answer = await local_svc.chat(
            message=req.latest_user_message,
            context=context,
        )
    else:
        async for chunk in local_svc.chat_stream(
            req.latest_user_message,
            context=context,
        ):
            full_answer_parts.append(chunk)
            yield sse_delta(chunk)
        full_answer = "".join(full_answer_parts) or _NO_RESPONSE_PLACEHOLDER
        if not full_answer_parts:
            yield sse_delta(full_answer)

    if _looks_truncated_response(full_answer):
        yield sse_meta({
            "provider": "local_ollama",
            "warning": "Detected possible truncation; auto-continuing once.",
        })
        continuation_history = _compact_chat_history(req.cleaned_messages[:-1]) + [
            {"role": "user", "content": req.latest_user_message},
            {"role": "assistant", "content": full_answer[-_CONTINUATION_HISTORY_TAIL:]},
        ]
        continuation_context = dict(context)
        continuation_context["chat_history"] = continuation_history
        continuation_context["task_profile"] = task_profile_for_phase("answer")

        continuation_parts: list[str] = []
        async for chunk in local_svc.chat_stream(_CONTINUATION_PROMPT, continuation_context):
            continuation_parts.append(chunk)
            if not should_buffer:
                yield sse_delta(chunk)
        full_answer += "".join(continuation_parts)

    postcheck_downgraded = 0
    if should_buffer:
        full_answer, postcheck_downgraded = _finalize_answer_text(
            req=req,
            rag=rag,
            meta=meta,
            answer=full_answer,
        )
        async for frame in _stream_buffered_answer(full_answer):
            yield frame

    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)
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
        phase="answer_local_ollama",
        extra=_build_p0_telemetry_extra(req, rag),
    )
    yield SSE_DONE


async def _generate_via_coze(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Generate the answer via the Coze cloud provider."""
    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    should_buffer = _needs_postcheck(req)
    full_answer_parts: list[str] = []
    try:
        async for token in _AI_GATEWAY_SERVICE.chat_stream_with_provider(
            message=req.latest_user_message,
            context=context,
            provider="coze",
        ):
            full_answer_parts.append(token)
            if not should_buffer:
                yield sse_delta(token)
    except Exception as exc:
        logger.warning("Coze streaming failed: %s", exc)
        yield sse_delta(f"Coze error: {str(exc)[:200]}")
        yield SSE_DONE
        return

    full_answer = "".join(full_answer_parts) or _NO_RESPONSE_PLACEHOLDER
    postcheck_downgraded = 0
    if should_buffer:
        full_answer, postcheck_downgraded = _finalize_answer_text(
            req=req,
            rag=rag,
            meta=meta,
            answer=full_answer,
        )
        async for frame in _stream_buffered_answer(full_answer):
            yield frame
    elif not full_answer_parts:
        yield sse_delta(full_answer)

    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)
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
        phase=_phase_name("coze", meta),
        extra=_build_p0_telemetry_extra(req, rag),
    )
    yield SSE_DONE


async def _generate_forced_response(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
) -> AsyncIterator[str]:
    """Emit a pre-built forced response (for example insufficient evidence)."""
    meta.warning = "insufficient_evidence"
    yield sse_meta(meta.to_dict())

    forced_text = str(rag.forced_response_message or "").strip() or _NO_RESPONSE_PLACEHOLDER
    async for frame in stream_text_as_sse(forced_text, chunk_size=2, delay=0.01):
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


async def _generate_via_deepseek(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Generate the answer via the DeepSeek cloud provider."""
    from backend.services.llm_service.deepseek_service import (
        DeepSeekService,
        DeepSeekUnavailableError,
    )
    from backend.services.user_profile_service import load_deepseek_runtime_config

    deepseek = DeepSeekService.from_config(await load_deepseek_runtime_config(req.user))
    answer_t0 = time.perf_counter()
    yield sse_meta(meta.to_dict())

    should_buffer = _needs_postcheck(req)
    full_answer_parts: list[str] = []
    try:
        if req.enable_thinking:
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
                    if not should_buffer:
                        yield sse_answer(chunk_content)
        else:
            async for chunk in deepseek.chat_stream(
                message=req.latest_user_message,
                context=context,
                enable_thinking=req.enable_thinking,
            ):
                full_answer_parts.append(chunk)
                if not should_buffer:
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

    full_answer = "".join(full_answer_parts) or _NO_RESPONSE_PLACEHOLDER
    postcheck_downgraded = 0
    if should_buffer:
        full_answer, postcheck_downgraded = _finalize_answer_text(
            req=req,
            rag=rag,
            meta=meta,
            answer=full_answer,
        )
        answer_frame = "answer" if req.enable_thinking else "delta"
        async for frame in _stream_buffered_answer(full_answer, answer_frame=answer_frame):
            yield frame
    elif not full_answer_parts:
        if req.enable_thinking:
            yield sse_answer(full_answer)
        else:
            yield sse_delta(full_answer)

    answer_latency_ms = round((time.perf_counter() - answer_t0) * 1000, 2)
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


async def generate_chat_response(
    req: ParsedRequest,
    rag: RAGResult,
    meta: StreamMeta,
    context: dict,
) -> AsyncIterator[str]:
    """Route the request to the correct provider strategy."""
    if rag.forced_response_message:
        async for frame in _generate_forced_response(req, rag, meta):
            yield frame
        return

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

    async for frame in _generate_via_coze(req, rag, meta, context):
        yield frame
