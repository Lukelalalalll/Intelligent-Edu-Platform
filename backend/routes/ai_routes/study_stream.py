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
from typing import Optional, List

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.core.ai_provider import AIProvider, resolve_provider
from backend.core.dependencies import get_ai_gateway_service
from backend.core.security import get_current_user
from backend.schemas.ai import ChatMessageSchema
from .router import _limiter
from fastapi import APIRouter
router = APIRouter()
from .prompting import _STUDY_COZE_SYSTEM
from .chat_context_helpers import _build_evidence_cards, _get_rag_context_for_study
from .study_modes import get_study_mode_suffix

logger = logging.getLogger(__name__)


class StudyStreamSchema(BaseModel):
    provider: Optional[AIProvider] = "local_ollama"
    content: str = Field(..., min_length=1, max_length=5000)
    mode: str = "chat"  # chat | hint | explain | quiz | simplify | expand
    context: Optional[str] = Field(None, max_length=20000)
    messages: Optional[List[ChatMessageSchema]] = Field(None, max_length=20)


@router.post("/study-stream")
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
    mode_suffix = get_study_mode_suffix(req.mode)

    rag_context_text, rag_citations = await _get_rag_context_for_study(user, content)
    system = _STUDY_COZE_SYSTEM + mode_suffix + rag_context_text

    async def event_generator():
        # 1. Citations first
        if rag_citations:
            yield f"data: {json.dumps({'type': 'citations', 'data': rag_citations})}\n\n"

        try:
            p = str(resolved_provider or "local_ollama").strip().lower()

            if p == "local_ollama":
                from backend.services.llm_service.local_llm_service import LocalLLMService, LocalLLMUnavailableError
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
                ai = get_ai_gateway_service()
                ai_context = {
                    "system_override": system,
                    "system_memory": f"Document:\n{context[:8000]}" if context else "",
                    "chat_history": history,
                }
                async for token in ai.chat_stream_with_provider(
                    message=content,
                    context=ai_context,
                    provider=resolved_provider,
                ):
                    if token:
                        yield f"data: {json.dumps({'type': 'text', 'data': token})}\n\n"

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
