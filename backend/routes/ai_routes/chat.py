"""Main /chat streaming endpoint.

Responsibilities in this file are kept thin — the route handler:
  1. Validates & parses the incoming request  (``_parse_and_validate``)
  2. Loads user AI-memory from DB              (``_load_ai_memory``)
  3. Runs student RAG if applicable            (``run_student_rag``)
  4. Builds the system-override & LLM context  (``_build_system_override``, ``_build_llm_context``)
  5. Delegates streaming generation to          ``chat_providers.generate_chat_response``
"""

from __future__ import annotations

import logging
from typing import Any

from cachetools import TTLCache
from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema
from backend.services.rag_chat_pipeline import task_profile_for_phase

from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_providers import generate_chat_response
from .chat_streaming import sse_error
from .chat_context_helpers import (
    _compact_chat_history,
    _is_document_summary_request,
    _split_user_prompt_and_attachment_text,
)
from .prompting import (
    _STUDENT_DOC_SUMMARY_MODE_MSG,
    _STUDENT_HINT_MODE_MSG,
    _STUDENT_SYSTEM_MSG,
    _STUDENT_TUTOR_MODE_MSG,
    _TEACHER_SYSTEM_MSG,
)
from .rag_orchestrator import run_student_rag
from .router import _SUPPORTED_PROVIDERS, _limiter, ai_router

logger = logging.getLogger(__name__)

# ── Cache-Aside TTL caches for hot-path DB queries ────────────────
# Avoids repeated MongoDB round-trips for data that rarely changes.
# Reference: Podlipnig & Böszörményi, "A Survey of Web Cache Replacement
# Strategies", ACM Computing Surveys 35(4), 2003.
_ai_memory_cache: TTLCache[str, str] = TTLCache(maxsize=1024, ttl=300)

# ── Memory profile fields we surface to the LLM ───────────────────
_MEMORY_FIELDS = ("name", "major", "year", "preferences")
_VALID_TUTOR_MODES = frozenset({"tutor", "hint_only"})


# ── Request parsing & validation ──────────────────────────────────

def _parse_and_validate(req: AiChatSchema, user: dict) -> ParsedRequest:
    """Extract, normalise and validate all request parameters.

    Raises ``HTTPException`` on invalid input.
    """
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages")

    cleaned = [m for m in req.messages if isinstance(m, dict)]
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid messages")

    user_messages = [m for m in cleaned if str(m.get("role", "")).lower() == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message")

    latest = user_messages[-1]
    latest_user_message = str(latest.get("content", "")).strip()
    prompt_only, attachment_text = _split_user_prompt_and_attachment_text(latest_user_message)
    effective_question = prompt_only or latest_user_message
    latest_user_images: list[Any] = latest.get("images", [])

    tutor_mode = str(getattr(req, "tutor_mode", "tutor") or "tutor").strip().lower()
    if tutor_mode not in _VALID_TUTOR_MODES:
        tutor_mode = "tutor"

    # Teachers and admins always get full tutor mode — hint_only only affects students
    role = user.get("role", "student")
    if role in ("teacher", "admin"):
        tutor_mode = "tutor"

    if not latest_user_message and not latest_user_images:
        raise HTTPException(status_code=400, detail="Latest user message is empty")

    # Provider resolution
    requested_provider = str(req.provider or Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
    if requested_provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {requested_provider}")
    if not Config.AI_ALLOW_PROVIDER_SWITCH and req.provider and req.provider != Config.AI_DEFAULT_PROVIDER:
        raise HTTPException(status_code=403, detail="Provider switching is disabled")

    role = user.get("role", "student")
    user_id = str(user.get("_id", user.get("id", "")))

    return ParsedRequest(
        latest_user_message=latest_user_message,
        prompt_only_message=prompt_only,
        uploaded_attachment_text=attachment_text,
        effective_question=effective_question,
        latest_user_images=latest_user_images,
        tutor_mode=tutor_mode,
        requested_provider=requested_provider,
        resolved_provider=requested_provider,
        role=role,
        is_student=role not in ("teacher", "admin"),
        user=user,
        user_id=user_id,
        cleaned_messages=cleaned,
        compact_history=_compact_chat_history(cleaned[:-1]),
        memory_text="",
    )


# ── AI memory (with Cache-Aside) ──────────────────────────────────

async def _load_ai_memory(user: dict) -> str:
    """Load the user's stored AI-memory profile from MongoDB.

    Uses an in-memory TTL cache (5 min) to avoid hitting MongoDB on
    every chat message for data that changes at most once per session.
    """
    cache_key = str(user.get("_id") or user.get("id") or "")
    cached = _ai_memory_cache.get(cache_key)
    if cached is not None:
        return cached

    user_doc = await db.users.find_one({"_id": user["_id"]})
    ai_memory: dict = (user_doc or {}).get("ai_memory", {})
    if not ai_memory:
        _ai_memory_cache[cache_key] = ""
        return ""

    parts = [
        f"{field.capitalize()}: {ai_memory[field]}"
        for field in _MEMORY_FIELDS
        if ai_memory.get(field)
    ]
    if not parts:
        _ai_memory_cache[cache_key] = ""
        return ""
    result = "Student profile — " + "; ".join(parts) + ". Adapt your responses to this student's background."
    _ai_memory_cache[cache_key] = result
    return result


# ── System override ───────────────────────────────────────────────

def _build_system_override(
    parsed: ParsedRequest,
    rag_context_text: str,
) -> str | None:
    """Build the system-level prompt override for students; ``None`` for teachers."""
    if not parsed.is_student:
        # Teachers / admins: use teacher prompt + RAG evidence if available
        if rag_context_text:
            return _TEACHER_SYSTEM_MSG + "\n\n" + rag_context_text
        return None

    if parsed.tutor_mode == "hint_only":
        mode_prompt = _STUDENT_HINT_MODE_MSG
    elif _is_document_summary_request(parsed.effective_question, parsed.uploaded_attachment_text):
        mode_prompt = _STUDENT_DOC_SUMMARY_MODE_MSG
    else:
        mode_prompt = _STUDENT_TUTOR_MODE_MSG

    return _STUDENT_SYSTEM_MSG + "\n\n" + mode_prompt + rag_context_text


# ── LLM context dict ─────────────────────────────────────────────

def _build_llm_context(
    parsed: ParsedRequest,
    compact_history: list[dict],
    system_override: str | None,
) -> dict:
    return {
        "chat_history": compact_history,
        "system_memory": parsed.memory_text,
        "coze_user_id": f"chat_{parsed.user_id or 'anon'}",
        "system_override": system_override,
        "images": parsed.latest_user_images,
        "task_profile": task_profile_for_phase("answer"),
    }


# ── Route handler ─────────────────────────────────────────────────

@ai_router.post("/chat")
@_limiter.limit("30/minute")
async def ai_chat(
    request: Request,
    req: AiChatSchema,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    # 1. Parse & validate
    parsed = _parse_and_validate(req, user)

    # 2. Load AI memory
    parsed.memory_text = await _load_ai_memory(user)

    # 3. RAG retrieval (all roles with courses)
    rag_dict = await run_student_rag(
        user=user,
        effective_question=parsed.effective_question,
        uploaded_attachment_text=parsed.uploaded_attachment_text,
        tutor_mode=parsed.tutor_mode,
        resolved_provider=parsed.resolved_provider,
        cleaned_messages=parsed.cleaned_messages,
    )
    rag = RAGResult.from_dict(rag_dict)

    # 4. Build system override & LLM context
    system_override = _build_system_override(parsed, rag.rag_context_text)
    context = _build_llm_context(parsed, rag.compact_history, system_override)

    # 5. Build SSE metadata envelope
    meta = StreamMeta.from_rag(
        rag,
        provider=parsed.resolved_provider,
        requested_provider=parsed.requested_provider,
        tutor_mode=parsed.tutor_mode,
    )

    # 6. Stream response
    async def _stream():
        try:
            async for frame in generate_chat_response(parsed, rag, meta, context):
                yield frame
        except Exception:
            logger.exception("AI chat streaming error")
            yield sse_error()

    return StreamingResponse(_stream(), media_type="text/event-stream")
