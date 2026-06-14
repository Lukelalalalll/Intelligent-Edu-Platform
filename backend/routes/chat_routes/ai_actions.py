"""AI assistant actions (summary, reply suggestions, rewrite, assistant) and file transfers."""

import logging

from fastapi import Depends, HTTPException

from backend.core.ai_provider import resolve_provider
from backend.core.security import get_current_user
from backend.schemas import (
    ChatAiSummarySchema,
    ChatAiReplySuggestionsSchema,
    ChatAiRewriteSchema,
    ChatAiAssistantSchema,
    ChatTransferStartSchema,
)
from backend.services.chat_service.query_service import get_room_for_member

from .router import chat_router

logger = logging.getLogger(__name__)


async def _verify_room_member(room_id: str, user_id: str):
    """Helper: verify user is a member of the room, return room doc or raise 404."""
    room = await get_room_for_member(room_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found or not a member")
    return room


@chat_router.post("/rooms/{room_id}/ai/summary")
async def ai_summary(
    room_id: str,
    body: ChatAiSummarySchema,
    user: dict = Depends(get_current_user),
):
    """Generate an AI summary of recent chat messages."""
    uid = str(user["id"])
    await _verify_room_member(room_id, uid)
    resolved_provider = resolve_provider(body.provider, feature="chat.summary", user=user)

    from backend.services.llm_service.chat_ai_service import run_summary
    try:
        result = await run_summary(
            room_id=room_id,
            user_id=uid,
            mode=body.mode,
            window_size=body.window_size,
            unread_since=body.unread_since,
            provider=resolved_provider,
        )
        return {"ok": True, **result}
    except Exception as exc:
        logger.exception("AI summary failed: room=%s user=%s", room_id, uid)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@chat_router.post("/rooms/{room_id}/ai/reply-suggestions")
async def ai_reply_suggestions(
    room_id: str,
    body: ChatAiReplySuggestionsSchema,
    user: dict = Depends(get_current_user),
):
    """Generate reply suggestions for the current conversation."""
    uid = str(user["id"])
    await _verify_room_member(room_id, uid)
    resolved_provider = resolve_provider(body.provider, feature="chat.reply_suggestions", user=user)

    from backend.services.llm_service.chat_ai_service import run_reply_suggestions
    try:
        result = await run_reply_suggestions(
            room_id=room_id,
            user_id=uid,
            tone=body.tone,
            latest_count=body.latest_count,
            provider=resolved_provider,
        )
        return {"ok": True, **result}
    except Exception as exc:
        logger.exception("AI reply suggestions failed: room=%s user=%s", room_id, uid)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@chat_router.post("/rooms/{room_id}/ai/rewrite")
async def ai_rewrite(
    room_id: str,
    body: ChatAiRewriteSchema,
    user: dict = Depends(get_current_user),
):
    """Rewrite draft text with AI in a given style."""
    uid = str(user["id"])
    await _verify_room_member(room_id, uid)
    resolved_provider = resolve_provider(body.provider, feature="chat.rewrite", user=user)

    from backend.services.llm_service.chat_ai_service import run_rewrite
    try:
        result = await run_rewrite(
            room_id=room_id,
            user_id=uid,
            draft_text=body.draft_text,
            style=body.style,
            provider=resolved_provider,
        )
        return {"ok": True, **result}
    except Exception as exc:
        logger.exception("AI rewrite failed: room=%s user=%s", room_id, uid)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@chat_router.post("/rooms/{room_id}/ai/assistant")
async def ai_assistant(
    room_id: str,
    body: ChatAiAssistantSchema,
    user: dict = Depends(get_current_user),
):
    """Ask the AI assistant a question based on chat context."""
    uid = str(user["id"])
    await _verify_room_member(room_id, uid)
    resolved_provider = resolve_provider(body.provider, feature="chat.assistant", user=user)

    from backend.services.llm_service.chat_ai_service import run_assistant
    try:
        result = await run_assistant(
            room_id=room_id,
            user_id=uid,
            query=body.query,
            context_window=body.context_window,
            provider=resolved_provider,
        )
        return {"ok": True, **result}
    except Exception as exc:
        logger.exception("AI assistant failed: room=%s user=%s", room_id, uid)
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


# ── File Transfer Station ──

@chat_router.post("/transfers/start")
async def transfer_start(
    body: ChatTransferStartSchema,
    user: dict = Depends(get_current_user),
):
    """Start a file transfer from a chat message to a target module."""
    uid = str(user["id"])
    await _verify_room_member(body.room_id, uid)

    from backend.services.chat_service.transfer_dispatch_service import create_transfer
    try:
        result = await create_transfer(
            room_id=body.room_id,
            message_id=body.message_id,
            owner_user_id=uid,
            target_module=body.target_module,
            target_options=body.target_options,
        )
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@chat_router.get("/transfers/{transfer_id}")
async def transfer_get(
    transfer_id: str,
    user: dict = Depends(get_current_user),
):
    """Get the current status of a transfer ticket."""
    uid = str(user["id"])
    from backend.services.chat_service.transfer_dispatch_service import get_transfer
    result = await get_transfer(transfer_id, uid)
    if not result:
        raise HTTPException(status_code=404, detail="Transfer not found")

    for key in ("created_at", "consumed_at", "expires_at"):
        if result.get(key):
            result[key] = result[key].isoformat()

    return {"ok": True, "transfer": result}


@chat_router.post("/transfers/{transfer_id}/consume")
async def transfer_consume(
    transfer_id: str,
    user: dict = Depends(get_current_user),
):
    """Consume a transfer ticket — dispatch the file to the target module."""
    uid = str(user["id"])
    from backend.services.chat_service.transfer_dispatch_service import consume_transfer
    try:
        result = await consume_transfer(transfer_id, uid)
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        logger.exception("Transfer consume failed: transfer_id=%s", transfer_id)
        raise HTTPException(status_code=502, detail=f"Dispatch error: {exc}")


@chat_router.post("/transfers/{transfer_id}/retry")
async def transfer_retry(
    transfer_id: str,
    user: dict = Depends(get_current_user),
):
    """Retry a failed transfer."""
    uid = str(user["id"])
    from backend.services.chat_service.transfer_dispatch_service import retry_transfer
    try:
        result = await retry_transfer(transfer_id, uid)
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        logger.exception("Transfer retry failed: transfer_id=%s", transfer_id)
        raise HTTPException(status_code=502, detail=f"Dispatch error: {exc}")
