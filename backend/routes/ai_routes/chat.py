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
from bson import ObjectId
from fastapi import Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import AiChatSchema
from backend.services.rag_service.rag_chat_pipeline import task_profile_for_phase

from .chat_models import ParsedRequest, RAGResult, StreamMeta
from .chat_providers import generate_chat_response
from .chat_streaming import sse_error, sse_tool_progress
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
from .rag_orchestrator import run_student_rag, _validate_context_window
from .router import _SUPPORTED_PROVIDERS, _limiter, ai_router
from backend.services.chat_service.session_bucket_service import load_all_messages

logger = logging.getLogger(__name__)

# ── Cache-Aside TTL caches for hot-path DB queries ────────────────
# Avoids repeated MongoDB round-trips for data that rarely changes.
# Reference: Podlipnig & Böszörményi, "A Survey of Web Cache Replacement
# Strategies", ACM Computing Surveys 35(4), 2003.
_ai_memory_cache: TTLCache[str, str] = TTLCache(maxsize=1024, ttl=300)

# ── Memory profile fields we surface to the LLM ───────────────────
_MEMORY_FIELDS = ("name", "major", "year", "preferences")
_VALID_TUTOR_MODES = frozenset({"tutor", "hint_only"})


def _normalize_chat_messages(messages: list[dict], limit: int = 100) -> list[dict]:
    cleaned: list[dict] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip().lower()
        if role not in {"user", "assistant", "system"}:
            continue
        content = str(item.get("content", "") or "").strip()
        images = item.get("images", [])
        if role in {"user", "assistant"} and not content and not images:
            continue
        msg = {"role": role, "content": content}
        if images:
            msg["images"] = images
        cleaned.append(msg)
    return cleaned[-max(1, int(limit)):]


def _is_same_message(a: dict, b: dict) -> bool:
    return (
        str(a.get("role", "")) == str(b.get("role", ""))
        and str(a.get("content", "")) == str(b.get("content", ""))
    )


async def _hydrate_messages_from_session(
    *,
    session_id: str,
    user: dict,
    request_messages: list[dict],
) -> tuple[list[dict], bool]:
    """Backfill chat history from persisted session when request history is short.

    This prevents memory loss when clients only send the latest turn.
    """
    session_id = str(session_id or "").strip()
    if not session_id:
        return request_messages, False

    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")

    doc = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(doc.get("userId", "")) != str(user.get("id", "")):
        raise HTTPException(status_code=403, detail="Session access denied")

    inline = doc.get("messages", [])
    if int(doc.get("bucketCount", 0) or 0) > 0:
        session_messages = await load_all_messages(session_id, inline)
    else:
        session_messages = inline

    normalized_session = _normalize_chat_messages(session_messages)
    normalized_request = _normalize_chat_messages(request_messages)
    if not normalized_session:
        return normalized_request, False

    # If the request already contains enough context, trust client payload.
    if len(normalized_request) >= max(4, len(normalized_session) - 2):
        return normalized_request, False

    merged = list(normalized_session)
    latest_request_user = None
    for msg in reversed(normalized_request):
        if str(msg.get("role", "")).lower() == "user":
            latest_request_user = msg
            break

    if latest_request_user and (not merged or not _is_same_message(merged[-1], latest_request_user)):
        merged.append(latest_request_user)

    return _normalize_chat_messages(merged), True


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
        raise HTTPException(status_code=400, detail="Provider switching is disabled")

    role = user.get("role", "student")
    user_id = str(user.get("_id", user.get("id", "")))

    enable_thinking = bool(getattr(req, "enable_thinking", False))

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
        session_id=str(getattr(req, "session_id", "") or "").strip(),
        session_backfilled=False,
        enable_thinking=enable_thinking,
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
    web_context_text: str = "",
    is_course_relevant: bool = False,
    has_web_results: bool = False,
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

    # Only inject course RAG context if the question is genuinely course-related.
    # When not course-relevant, injecting irrelevant local evidence confuses the LLM.
    # Web context is always injected when present — it's explicitly requested by the user.
    effective_rag = (rag_context_text if is_course_relevant else "") + web_context_text
    base = _STUDENT_SYSTEM_MSG + "\n\n" + mode_prompt + effective_rag

    # ── Hybrid RAG + Web synthesis instruction ────────────────────
    if is_course_relevant and has_web_results:
        base += (
            "\n\n[Synthesis Mode — IMPORTANT]\n"
            "You have access to BOTH course materials AND live web results.\n"
            "Follow these rules strictly:\n"
            "1. Ground your answer PRIMARILY in the course materials — they are the authoritative "
            "source for this course.\n"
            "2. Use web results to fill gaps, add updated information, or provide real-world "
            "examples that reinforce course concepts.\n"
            "3. When web information extends or contradicts course material, say so explicitly "
            "so the student is aware.\n"
            "4. DO NOT output any citation markers, reference numbers, or evidence labels "
            "(e.g. Evidence 1, [Doc 1], [Web 1]) in your reply — citations are shown separately in the UI.\n"
            "5. Produce a single, unified answer — do NOT output separate sections for course "
            "vs. web content."
        )
    elif has_web_results and not is_course_relevant:
        base += (
            "\n\n[Web Search Mode]\n"
            "No course-specific materials matched this query. "
            "Your answer is based on web search results. "
            "DO NOT output any citation markers or reference numbers in your reply — "
            "citations are shown separately in the UI. Be accurate and concise."
        )

    return base


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

    # 1.1 Optional server-side history hydration from persisted session
    if parsed.session_id:
        hydrated_messages, used_backfill = await _hydrate_messages_from_session(
            session_id=parsed.session_id,
            user=user,
            request_messages=parsed.cleaned_messages,
        )
        parsed.cleaned_messages = hydrated_messages
        parsed.compact_history = _compact_chat_history(parsed.cleaned_messages[:-1])
        parsed.session_backfilled = used_backfill

    # 2. Load AI memory
    parsed.memory_text = await _load_ai_memory(user)

    # 3-6. Stream response (RAG + context building moved inside generator
    # so we can push progress frames to the frontend immediately)
    async def _stream():
        try:
            # ① Push progress frame immediately — lights up the frontend status
            yield sse_tool_progress("RAG", "running", message="正在检索课程资料与优化查询...")

            # ② RAG retrieval (all roles with courses) — skip if use_rag=False
            use_rag = bool(getattr(req, "use_rag", True))
            if use_rag:
                rag_dict = await run_student_rag(
                    user=user,
                    effective_question=parsed.effective_question,
                    uploaded_attachment_text=parsed.uploaded_attachment_text,
                    tutor_mode=parsed.tutor_mode,
                    resolved_provider=parsed.resolved_provider,
                    cleaned_messages=parsed.cleaned_messages,
                    web_search=bool(getattr(req, "web_search", False)),
                    search_engine=str(getattr(req, "search_engine", "auto") or "auto"),
                )
            else:
                rag_dict = {
                    "rag_context_text": "",
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
                }
            rag = RAGResult.from_dict(rag_dict)

            # ③ RAG complete
            yield sse_tool_progress("RAG", "done", message="检索完成")

            # ④ Build system override & LLM context
            _has_web = any(c.get("source_type") == "web" for c in rag.rag_citations)
            system_override = _build_system_override(
                parsed,
                rag.rag_context_text,
                web_context_text=rag.web_context_text,
                is_course_relevant=rag.is_course_relevant,
                has_web_results=_has_web,
            )
            system_override = _validate_context_window(
                provider=parsed.resolved_provider,
                system_override=system_override,
                compact_history=rag.compact_history,
                question=parsed.effective_question,
                memory_text=parsed.memory_text,
            )
            context = _build_llm_context(parsed, rag.compact_history, system_override)

            # ⑤ Build SSE metadata envelope
            meta = StreamMeta.from_rag(
                rag,
                provider=parsed.resolved_provider,
                requested_provider=parsed.requested_provider,
                tutor_mode=parsed.tutor_mode,
            )

            # ⑥ Stream LLM response
            async for frame in generate_chat_response(parsed, rag, meta, context):
                yield frame
        except Exception:
            logger.exception("AI chat streaming error")
            yield sse_error()

    return StreamingResponse(_stream(), media_type="text/event-stream")
