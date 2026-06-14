"""Streaming RAG + provider orchestration for /ai/chat."""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from backend.schemas import AiChatSchema

from .chat_context_helpers import _compact_chat_history
from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_providers import generate_chat_response
from .chat_streaming import sse_error, sse_tool_progress
from .chat_system import build_llm_context, build_system_override
from .rag_orchestrator import (
    _should_bypass_course_rag,
    _should_emit_course_rag_progress,
    _validate_context_window,
    run_student_rag,
)

logger = logging.getLogger(__name__)


def _empty_rag_dict(parsed: ParsedRequest) -> dict[str, Any]:
    return {
        "rag_context_text": "",
        "web_context_text": "",
        "rag_citations": [],
        "rag_top_k": 0,
        "rag_retrieve_top_n": 0,
        "rag_retry_used": False,
        "rag_retry_success": False,
        "rag_empty_after_retry": False,
        "rag_retrieval_query": parsed.effective_question,
        "rag_rewritten_query": parsed.effective_question,
        "rag_retrieval_latency_ms": 0.0,
        "student_course_ids": [],
        "forced_response_message": "",
        "compact_history": _compact_chat_history(parsed.cleaned_messages[:-1]),
        "is_course_relevant": False,
        "retrieval_plan": {},
        "retrieval_trace": [],
        "retrieval_confidence": {},
        "fallback_reason": "",
        "evidence_spans": [],
    }


async def stream_chat_frames(parsed: ParsedRequest, req: AiChatSchema, user: dict) -> AsyncIterator[str]:
    try:
        rag_dict, emit_rag_progress = await _resolve_rag_context(parsed, req, user)
        if emit_rag_progress:
            yield sse_tool_progress("RAG", "running", message="Retrieving course context...")
        rag = RAGResult.from_dict(rag_dict)
        if emit_rag_progress:
            yield sse_tool_progress("RAG", "done", message="Context ready.")
        has_web_results = any(citation.get("source_type") == "web" for citation in rag.rag_citations)
        system_override = build_system_override(
            parsed,
            rag.rag_context_text,
            web_context_text=rag.web_context_text,
            is_course_relevant=rag.is_course_relevant,
            has_web_results=has_web_results,
            fallback_reason=rag.fallback_reason,
        )
        system_override = _validate_context_window(
            provider=parsed.resolved_provider,
            system_override=system_override,
            compact_history=rag.compact_history,
            question=parsed.effective_question,
            memory_text=parsed.memory_text,
        )
        context = build_llm_context(parsed, rag.compact_history, system_override)
        meta = StreamMeta.from_rag(
            rag,
            provider=parsed.resolved_provider,
            requested_provider=parsed.requested_provider,
            tutor_mode=parsed.tutor_mode,
        )
        async for frame in generate_chat_response(parsed, rag, meta, context):
            yield frame
    except Exception:
        logger.exception("AI chat streaming error")
        yield sse_error()


async def _resolve_rag_context(parsed: ParsedRequest, req: AiChatSchema, user: dict) -> tuple[dict[str, Any], bool]:
    use_rag = bool(getattr(req, "use_rag", True))
    emit_rag_progress = False
    course_scope: dict[str, list[str]] | None = None
    if use_rag:
        should_bypass = _should_bypass_course_rag(parsed.effective_question, parsed.uploaded_attachment_text)
        use_rag = not should_bypass
        if use_rag:
            emit_rag_progress, course_scope = await _should_emit_course_rag_progress(
                user=user,
                question=parsed.effective_question,
                uploaded_attachment_text=parsed.uploaded_attachment_text,
            )
    if not use_rag:
        return _empty_rag_dict(parsed), False

    rag_dict = await run_student_rag(
        user=user,
        effective_question=parsed.effective_question,
        uploaded_attachment_text=parsed.uploaded_attachment_text,
        tutor_mode=parsed.tutor_mode,
        resolved_provider=parsed.resolved_provider,
        cleaned_messages=parsed.cleaned_messages,
        web_search=bool(getattr(req, "web_search", False)),
        search_engine=str(getattr(req, "search_engine", "auto") or "auto"),
        rag_profile=parsed.rag_profile,
        debug_retrieval=parsed.debug_retrieval,
        allow_web_correction=parsed.allow_web_correction,
        force_query_class=parsed.force_query_class,
        course_scope=course_scope,
    )
    return rag_dict, emit_rag_progress
