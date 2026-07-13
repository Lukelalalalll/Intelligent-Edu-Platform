"""Request parsing for /ai/chat."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.config import Config
from backend.schemas import AiChatSchema
from backend.services.ai.ai_memory_service import load_ai_memory_text
from backend.services.ai.ai_session_service import hydrate_request_messages_from_session

from .chat_context_helpers import _compact_chat_history, _split_user_prompt_and_attachment_text
from .chat_models import ParsedRequest
from .router import _SUPPORTED_PROVIDERS

_VALID_TUTOR_MODES = frozenset({"tutor", "hint_only"})


def parse_and_validate_chat_request(req: AiChatSchema, user: dict) -> ParsedRequest:
    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages")
    cleaned = [message for message in req.messages if isinstance(message, dict)]
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid messages")
    user_messages = [message for message in cleaned if str(message.get("role", "")).lower() == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message")

    latest = user_messages[-1]
    latest_user_message = str(latest.get("content", "")).strip()
    prompt_only, attachment_text = _split_user_prompt_and_attachment_text(latest_user_message)
    latest_user_images: list[Any] = latest.get("images", [])
    tutor_mode = str(getattr(req, "tutor_mode", "tutor") or "tutor").strip().lower()
    if tutor_mode not in _VALID_TUTOR_MODES:
        tutor_mode = "tutor"

    role = user.get("role", "student")
    if role in ("teacher", "admin"):
        tutor_mode = "tutor"
    if not latest_user_message and not latest_user_images:
        raise HTTPException(status_code=400, detail="Latest user message is empty")

    requested_provider = str(req.provider or Config.AI_DEFAULT_PROVIDER or "local_ollama").strip().lower()
    if requested_provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {requested_provider}")
    if not Config.AI_ALLOW_PROVIDER_SWITCH and req.provider and req.provider != Config.AI_DEFAULT_PROVIDER:
        raise HTTPException(status_code=400, detail="Provider switching is disabled")

    return ParsedRequest(
        latest_user_message=latest_user_message,
        prompt_only_message=prompt_only,
        uploaded_attachment_text=attachment_text,
        effective_question=prompt_only or latest_user_message,
        latest_user_images=latest_user_images,
        tutor_mode=tutor_mode,
        requested_provider=requested_provider,
        resolved_provider=requested_provider,
        role=role,
        is_student=role not in ("teacher", "admin"),
        user=user,
        user_id=str(user.get("_id", user.get("id", ""))),
        cleaned_messages=cleaned,
        compact_history=_compact_chat_history(cleaned[:-1]),
        memory_text="",
        session_id=str(getattr(req, "session_id", "") or "").strip(),
        session_backfilled=False,
        enable_thinking=bool(getattr(req, "enable_thinking", False)),
        rag_profile=str(getattr(req, "rag_profile", "balanced") or "balanced").strip().lower(),
        debug_retrieval=bool(getattr(req, "debug_retrieval", False)),
        allow_web_correction=bool(getattr(req, "allow_web_correction", False)),
        force_query_class=str(getattr(req, "force_query_class", "") or "").strip(),
    )


async def hydrate_chat_request(parsed: ParsedRequest, req: AiChatSchema, user: dict) -> ParsedRequest:
    if parsed.session_id:
        hydrated_messages, used_backfill = await hydrate_request_messages_from_session(
            session_id=parsed.session_id,
            user_id=str(user.get("id", "")),
            request_messages=parsed.cleaned_messages,
        )
        parsed.cleaned_messages = hydrated_messages
        parsed.compact_history = _compact_chat_history(parsed.cleaned_messages[:-1])
        parsed.session_backfilled = used_backfill
    parsed.memory_text = await load_ai_memory_text(user)
    return parsed

