"""Streaming SSE endpoint for Study Coach — replaces non-streaming /study-coze.

POST /ai/study-stream
  Body: same as StudyCozeSchema, mode extends to: chat | hint | explain | quiz | simplify | expand
  Response: text/event-stream

Event types:
  {"type": "citations", "data": [...]}   — sent first if RAG citations exist
  {"type": "text",      "data": "chunk"} — LLM token chunks
  {"type": "done"}                        — stream ended cleanly
  {"type": "error",     "data": "msg"}   — error occurred
"""
from __future__ import annotations

import json
import logging
from typing import Literal, Optional, List

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.schemas.ai import ChatMessageSchema
from backend.services.rag_chat_pipeline import pack_evidence

from .router import ai_router, _limiter
from .prompting import _STUDY_COZE_SYSTEM
from .chat_context_helpers import _build_evidence_cards

logger = logging.getLogger(__name__)

# ── Extended mode suffixes (superset of study_coach.py) ───────────────────────
_MODE_SUFFIXES: dict[str, str] = {
    "hint": (
        "\n\nThe student selected this text — provide a Socratic hint to guide their thinking, "
        "not a direct explanation."
    ),
    "explain": "\n\nExplain this concept in simple terms with an analogy.",
    "quiz": (
        "\n\nBased on the selected text, generate ONE multiple-choice question with 4 options (A/B/C/D) "
        "and mark the correct answer. Format: Question → Options → Answer → Brief explanation."
    ),
    "simplify": (
        "\n\nRewrite the selected text in very simple language, as if explaining to a 12-year-old. "
        "Use short sentences and plain vocabulary."
    ),
    "expand": (
        "\n\nExpand on the selected text with deeper context, related concepts, real-world examples, "
        "and connections to broader ideas in this field."
    ),
}


class StudyStreamSchema(BaseModel):
    provider: Optional[Literal["coze", "local_ollama"]] = "local_ollama"
    content: str = Field(..., min_length=1, max_length=5000)
    mode: str = "chat"  # chat | hint | explain | quiz | simplify | expand
    context: Optional[str] = Field(None, max_length=20000)
    messages: Optional[List[ChatMessageSchema]] = Field(None, max_length=20)


async def _get_rag_context(user: dict, content: str) -> tuple[str, list]:
    """Retrieve RAG citations, returning (context_text, citations_list). Never raises."""
    try:
        from backend.services.course_rag_service import course_rag_service
        from backend.routes.auth_routes import get_profile_courses
        from backend.config import Config

        profile = await get_profile_courses(user)
        student_course_ids = [c["courseId"] for c in profile.get("courses", []) if c.get("courseId")]
        if not student_course_ids:
            return "", []

        rag_results = course_rag_service.retrieve_for_student(
            student_id=str(user.get("_id", user.get("id", ""))),
            query=content,
            top_k=max(1, int(Config.RAG_RETRIEVE_TOP_N)),
            course_ids=student_course_ids,
        )
        packed = pack_evidence(
            rag_results,
            answer_top_k=4,
            max_total_chars=Config.RAG_EVIDENCE_MAX_CHARS,
            max_chars_per_chunk=Config.RAG_EVIDENCE_MAX_CHARS_PER_CHUNK,
        )
        if packed:
            return _build_evidence_cards(packed), packed
    except Exception:
        logger.debug("Study stream RAG retrieval unavailable", exc_info=True)
    return "", []


@ai_router.post("/study-stream")
@_limiter.limit("20/minute")
async def study_stream(
    request: Request,
    req: StudyStreamSchema,
    user: dict = Depends(get_current_user),
):
    """SSE streaming Study Coach. Yields text/event-stream chunks."""
    content = req.content.strip()
    context = (req.context or "").strip()
    history = [m.model_dump() for m in (req.messages or [])]
    resolved_provider = resolve_provider(req.provider, feature="study_coach", user=user)
    mode_suffix = _MODE_SUFFIXES.get(req.mode, "")

    rag_context_text, rag_citations = await _get_rag_context(user, content)
    system = _STUDY_COZE_SYSTEM + mode_suffix + rag_context_text

    async def event_generator():
        # 1. Citations first
        if rag_citations:
            yield f"data: {json.dumps({'type': 'citations', 'data': rag_citations})}\n\n"

        try:
            p = str(resolved_provider or "local_ollama").strip().lower()

            if p == "local_ollama":
                from backend.services.local_llm_service import LocalLLMService, LocalLLMUnavailableError
                local = LocalLLMService()
                is_healthy, health_msg = await local.health_check()
                if not is_healthy:
                    raise LocalLLMUnavailableError(f"Health check failed: {health_msg}")

                ai_context = {
                    "system_override": system,
                    "system_memory": f"Document:\n{context[:8000]}" if context else "",
                    "chat_history": history,
                }
                async for chunk in local.chat_stream(message=content, context=ai_context):
                    if chunk:
                        yield f"data: {json.dumps({'type': 'text', 'data': chunk})}\n\n"

            else:
                # Coze / fallback: get full response then stream word-by-word
                from backend.services.ai_gateway_service import AIGatewayService
                ai = AIGatewayService()
                ai_context = {
                    "system_override": system,
                    "system_memory": f"Document:\n{context[:8000]}" if context else "",
                    "chat_history": history,
                }
                full = await ai.chat_with_provider(
                    message=content,
                    context=ai_context,
                    provider=resolved_provider,
                )
                # Simulate token streaming: yield ~4 chars per frame
                for i in range(0, len(full), 4):
                    chunk = full[i:i + 4]
                    if chunk:
                        yield f"data: {json.dumps({'type': 'text', 'data': chunk})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            logger.exception("study-stream error")
            yield f"data: {json.dumps({'type': 'error', 'data': str(exc)[:300]})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
