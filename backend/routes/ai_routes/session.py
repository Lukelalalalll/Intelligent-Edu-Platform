"""Session CRUD endpoints – all scoped to current user."""

from datetime import datetime, timezone
from bson import ObjectId
from fastapi import Depends, HTTPException, Request

from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import UpdateAiSessionSchema
from backend.services.llm_service.ai_session_service import sanitize_session_update_payload
from backend.services.file_asset_service import ensure_ai_session_image_assets
from backend.services.security_audit import log_security_event
from backend.services.chat_service.session_bucket_service import (
    delete_session_buckets,
    load_all_messages,
    save_messages_bucketed,
)

import logging

from .router import ai_router, _DEFAULT_TITLE, _ERR_INVALID_ID, _ERR_NOT_FOUND, _ERR_FORBIDDEN
from .prompting import _TEACHER_SYSTEM_MSG, _STUDENT_SYSTEM_MSG

logger = logging.getLogger(__name__)


@ai_router.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    """Return all sessions for the current user (title + meta only, no messages)."""
    cursor = db.ai_chat_sessions.find(
        {"userId": ObjectId(user["id"])},
        {"messages": 0},
    ).sort("updatedAt", -1)
    sessions = []
    async for doc in cursor:
        sessions.append({
            "id": str(doc["_id"]),
            "clientId": doc.get("clientId", ""),
            "title": doc.get("title", _DEFAULT_TITLE),
            "createdAt": doc.get("createdAt", ""),
            "updatedAt": doc.get("updatedAt", ""),
        })
    return {"sessions": sessions}


@ai_router.post("/sessions")
async def create_session(user: dict = Depends(get_current_user)):
    """Create a new empty session and return its server-side _id."""
    now = datetime.now(timezone.utc)
    role = user.get("role", "student")
    system_content = _TEACHER_SYSTEM_MSG if role in ("teacher", "admin") else _STUDENT_SYSTEM_MSG
    doc = {
        "userId": ObjectId(user["id"]),
        "clientId": "",
        "title": _DEFAULT_TITLE,
        "messages": [{"role": "system", "content": system_content, "createdAt": now}],
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.ai_chat_sessions.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "title": doc["title"],
        "messages": [{"role": "system", "content": doc["messages"][0]["content"]}],
        "createdAt": now,
        "updatedAt": now,
    }


@ai_router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    body: UpdateAiSessionSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Sync a session's title + messages. Only the owning user may update."""
    request_id = getattr(request.state, "request_id", "unknown")
    endpoint = f"/api/ai/sessions/{session_id}"
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    existing = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not existing:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(existing["userId"]) != user["id"]:
        log_security_event(
            level="warning",
            request_id=request_id,
            user_id=str(user.get("id") or ""),
            endpoint=endpoint,
            action="update_session_forbidden",
            detail="session ownership mismatch",
        )
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    now = datetime.now(timezone.utc)
    update_fields = {"updatedAt": now}
    idempotency_key = (request.headers.get("X-Idempotency-Key") or "").strip()[:128]

    if idempotency_key and existing.get("lastIdempotencyKey") == idempotency_key:
        log_security_event(
            level="info",
            request_id=request_id,
            user_id=str(user.get("id") or ""),
            endpoint=endpoint,
            action="update_session_idempotent_replay",
            detail="duplicate idempotency key ignored",
        )
        return {"ok": True, "idempotent": True}
    try:
        sanitized = sanitize_session_update_payload(body)
    except ValueError as exc:
        log_security_event(
            level="warning",
            request_id=request_id,
            user_id=str(user.get("id") or ""),
            endpoint=endpoint,
            action="update_session_rejected",
            detail=str(exc)[:240],
        )
        raise HTTPException(status_code=400, detail=str(exc))

    update_fields.update(sanitized)
    if idempotency_key:
        update_fields["lastIdempotencyKey"] = idempotency_key
    update_fields["lastWriterUserId"] = str(user.get("id") or "")
    update_fields["lastWriteRequestId"] = request_id

    # ── Bucket pattern: split large message arrays into buckets ────
    if "messages" in update_fields:
        bucket_result = await save_messages_bucketed(
            session_id, update_fields["messages"],
        )
        update_fields["messages"] = bucket_result["inline_messages"]
        update_fields["bucketCount"] = bucket_result["bucket_count"]

    # ── Optimistic concurrency: increment revision on each write ──
    current_revision = existing.get("revision", 0)
    update_fields["revision"] = current_revision + 1

    result = await db.ai_chat_sessions.update_one(
        {"_id": ObjectId(session_id), "revision": current_revision},
        {"$set": update_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Session modified concurrently — please reload and try again")
    if "messages" in update_fields:
        try:
            await ensure_ai_session_image_assets(str(user.get("_id") or user.get("id") or ""))
        except Exception:
            logger.exception("Failed to sync AI image assets for user=%s", str(user.get("id") or ""))
    return {"ok": True}


@ai_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a session. Only the owning user may delete."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    existing = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not existing:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(existing["userId"]) != user["id"]:
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    await db.ai_chat_sessions.delete_one({"_id": ObjectId(session_id)})
    await delete_session_buckets(session_id)
    return {"ok": True}


@ai_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    """Return a single session with full messages."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail=_ERR_INVALID_ID)

    doc = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=_ERR_NOT_FOUND)
    if str(doc["userId"]) != user["id"]:
        raise HTTPException(status_code=403, detail=_ERR_FORBIDDEN)

    # ── Reconstruct full messages from buckets + inline tail ──────
    inline_msgs = doc.get("messages", [])
    if doc.get("bucketCount", 0) > 0:
        all_msgs = await load_all_messages(session_id, inline_msgs)
    else:
        all_msgs = inline_msgs

    # Strip createdAt from each message for frontend compat, and ObjectId fields
    messages = []
    for m in all_msgs:
        msg = {
            "role": m.get("role", ""),
            "content": m.get("content", ""),
        }
        if m.get("images"):
            msg["images"] = m.get("images")
        messages.append(msg)

    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", _DEFAULT_TITLE),
        "messages": messages,
        "createdAt": doc.get("createdAt", ""),
        "updatedAt": doc.get("updatedAt", ""),
    }
