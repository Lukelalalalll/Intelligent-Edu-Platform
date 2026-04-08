"""
Chat AI Service — Orchestrates intelligent assistant capabilities for the chat module.

All AI calls go through the existing AIGatewayService (Coze text API).
"""

import logging
import time
from typing import Optional

from backend.core.database import db
from backend.prompts import prompt_registry
from backend.services.ai_gateway_service import AIGatewayService

logger = logging.getLogger(__name__)

# Context limits
MAX_CONTEXT_MESSAGES = 50
MAX_MESSAGE_CHARS = 400
MAX_PAYLOAD_CHARS = 15000

_ai_svc: Optional[AIGatewayService] = None


def _get_ai_svc() -> AIGatewayService:
    global _ai_svc
    if _ai_svc is None:
        _ai_svc = AIGatewayService()
    return _ai_svc


def _format_messages(messages: list[dict], max_chars: int = MAX_PAYLOAD_CHARS) -> str:
    """Format message list into a text block for prompt injection."""
    lines: list[str] = []
    total = 0
    for msg in messages:
        sender = msg.get("senderName", "Unknown")
        content = (msg.get("content", "") or "")[:MAX_MESSAGE_CHARS]
        sent_at = msg.get("sentAt", "")
        if msg.get("recalled"):
            continue
        if msg.get("type") == "system":
            continue
        line = f"[{sent_at}] {sender}: {content}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line)
    return "\n".join(lines)


async def _fetch_room_messages(
    room_id: str,
    limit: int = MAX_CONTEXT_MESSAGES,
    since: Optional[str] = None,
) -> list[dict]:
    """Fetch recent messages from a room, optionally since a timestamp."""
    query: dict = {"roomId": room_id}
    if since:
        query["sentAt"] = {"$gt": since}
    cursor = db.chat_messages.find(query).sort("sentAt", -1).limit(limit)
    messages = []
    async for doc in cursor:
        messages.append(doc)
    messages.reverse()
    return messages


async def _log_ai_job(
    user_id: str,
    room_id: str,
    feature: str,
    latency_ms: float,
    success: bool,
    error_message: str = "",
) -> None:
    """Write audit record for AI usage tracking."""
    from datetime import datetime, timezone
    await db.chat_ai_jobs.insert_one({
        "user_id": user_id,
        "room_id": room_id,
        "feature": feature,
        "latency_ms": round(latency_ms, 2),
        "success": success,
        "error_message": error_message[:500] if error_message else "",
        "created_at": datetime.now(timezone.utc),
    })


async def run_summary(
    room_id: str,
    user_id: str,
    mode: str = "summary",
    window_size: int = 30,
    unread_since: Optional[str] = None,
) -> dict:
    """Generate a summary of recent chat messages.

    mode: 'summary' | 'unread' | 'action_items'
    """
    start = time.perf_counter()
    try:
        if mode == "unread" and unread_since:
            messages = await _fetch_room_messages(room_id, limit=window_size, since=unread_since)
        else:
            messages = await _fetch_room_messages(room_id, limit=window_size)

        if not messages:
            return {"summary": "No messages to summarize.", "action_items": [], "decisions": [], "risks": []}

        formatted = _format_messages(messages)

        prompt_name = {
            "summary": "summary",
            "unread": "unread_summary",
            "action_items": "action_items",
        }.get(mode, "summary")

        prompt = prompt_registry.render("chat_assistant", prompt_name, messages=formatted)
        svc = _get_ai_svc()
        result = await svc.chat(prompt)

        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, f"summary_{mode}", latency, True)

        return {
            "summary": result,
            "mode": mode,
            "message_count": len(messages),
        }
    except Exception as exc:
        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, f"summary_{mode}", latency, False, str(exc))
        raise


async def run_reply_suggestions(
    room_id: str,
    user_id: str,
    tone: str = "concise",
    latest_count: int = 10,
) -> dict:
    """Generate 3 reply suggestions based on recent context."""
    start = time.perf_counter()
    try:
        messages = await _fetch_room_messages(room_id, limit=latest_count)
        if not messages:
            return {"suggestions": ["OK", "Got it", "Thanks"]}

        formatted = _format_messages(messages, max_chars=6000)
        prompt = prompt_registry.render(
            "chat_assistant", "reply_suggestions",
            messages=formatted, tone=tone,
        )
        svc = _get_ai_svc()
        result = await svc.chat(prompt)

        # Parse 3 lines
        lines = [line.strip() for line in result.strip().split("\n") if line.strip()]
        suggestions = lines[:3] if lines else ["OK", "Got it", "Thanks"]

        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "reply_suggestions", latency, True)

        return {"suggestions": suggestions}
    except Exception as exc:
        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "reply_suggestions", latency, False, str(exc))
        raise


async def run_rewrite(
    room_id: str,
    user_id: str,
    draft_text: str,
    style: str = "concise",
) -> dict:
    """Rewrite draft text with a given style."""
    start = time.perf_counter()
    try:
        if not draft_text.strip():
            return {"rewritten_text": ""}

        prompt = prompt_registry.render(
            "chat_assistant", "rewrite",
            draft_text=draft_text[:2000], style=style,
        )
        svc = _get_ai_svc()
        result = await svc.chat(prompt)

        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "rewrite", latency, True)

        return {"rewritten_text": result.strip()}
    except Exception as exc:
        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "rewrite", latency, False, str(exc))
        raise


async def run_assistant(
    room_id: str,
    user_id: str,
    query: str,
    context_window: int = 20,
) -> dict:
    """Answer a question using recent chat context."""
    start = time.perf_counter()
    try:
        messages = await _fetch_room_messages(room_id, limit=context_window)
        formatted = _format_messages(messages, max_chars=8000)

        prompt = prompt_registry.render(
            "chat_assistant", "assistant_qa",
            context=formatted, query=query[:1000],
        )
        svc = _get_ai_svc()
        result = await svc.chat(prompt)

        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "assistant", latency, True)

        return {"answer": result.strip()}
    except Exception as exc:
        latency = (time.perf_counter() - start) * 1000
        await _log_ai_job(user_id, room_id, "assistant", latency, False, str(exc))
        raise
