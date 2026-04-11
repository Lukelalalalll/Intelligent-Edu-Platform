"""Message CRUD, recall, translate, batch-delete, and forward endpoints."""

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import Depends, File, HTTPException, Query, UploadFile

from backend.core.database import db
from backend.core.security import get_current_user
from backend.core.ai_provider import resolve_provider
from backend.core.utils import safe_object_id
from backend.schemas import (
    ChatSendMessageSchema,
    ChatTranslateSchema,
    ChatBatchDeleteSchema,
    ChatForwardSchema,
)
from backend.services.file_asset_service import register_file_asset

from .router import (
    chat_router, _utcnow, _str_id, _storage_path_from_file_url,
    manager,
    ALLOWED_EXTENSIONS, _MAGIC_SIGNATURES, MAX_UPLOAD_SIZE, CHAT_FILES_DIR,
)

logger = logging.getLogger(__name__)


@chat_router.get("/rooms/{room_id}/messages")
async def get_messages(
    room_id: str,
    before: str = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Get paginated messages for a room (cursor-based)."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    query: dict = {"roomId": room_id, "deletedFor": {"$ne": uid}}
    if before:
        query["sentAt"] = {"$lt": before}

    cursor = db.chat_messages.find(query).sort("sentAt", -1).limit(limit + 1)
    messages = []
    async for doc in cursor:
        messages.append(_str_id(doc))

    has_more = len(messages) > limit
    messages = messages[:limit]
    messages.reverse()
    return {"messages": messages, "hasMore": has_more}


@chat_router.post("/rooms/{room_id}/messages")
async def send_message_rest(
    room_id: str,
    body: ChatSendMessageSchema,
    user: dict = Depends(get_current_user),
):
    """REST fallback for sending a message when WebSocket is unavailable."""
    uid = str(user["id"])
    content = (body.content or "").strip()
    if not content and (body.messageType or "text") == "text":
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    reply_to = None
    if body.replyTo:
        ref = await db.chat_messages.find_one({"_id": safe_object_id(body.replyTo, label="message")})
        if ref:
            reply_to = {
                "id": str(ref["_id"]),
                "senderName": ref.get("senderName", ""),
                "content": (ref.get("content", "") or "")[:120],
            }

    now = _utcnow()
    msg_doc = {
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": content,
        "type": "text",
        "messageType": body.messageType or "text",
        "fileUrl": body.fileUrl,
        "fileName": body.fileName,
        "fileSize": body.fileSize,
        "mimeType": body.mimeType,
        "replyTo": reply_to,
        "recalled": False,
        "readBy": [uid],
        "deletedFor": [],
        "sentAt": now,
    }
    result = await db.chat_messages.insert_one(msg_doc)
    msg_doc["id"] = str(result.inserted_id)
    msg_doc.pop("_id", None)

    if msg_doc.get("fileUrl"):
        try:
            matched = await db.file_assets.update_one(
                {
                    "file_type": "chat_attachment",
                    "public_url": str(msg_doc.get("fileUrl") or ""),
                    "status": {"$ne": "hard_deleted"},
                },
                {
                    "$set": {
                        "owner_type": "chat_message",
                        "owner_id": msg_doc["id"],
                        "scope": "chat_group",
                        "room_id": room_id,
                        "user_id": uid,
                        "updated_at": datetime.now(timezone.utc),
                        "status": "active",
                    }
                },
            )
            if matched.matched_count == 0:
                await register_file_asset(
                    file_type="chat_attachment",
                    storage_path=_storage_path_from_file_url(msg_doc.get("fileUrl", "")),
                    size=int(msg_doc.get("fileSize") or 0),
                    owner_type="chat_message",
                    owner_id=msg_doc["id"],
                    created_by=uid,
                    filename=str(msg_doc.get("fileName") or ""),
                    mime_type=str(msg_doc.get("mimeType") or ""),
                    course_id=str(room.get("courseId") or ""),
                    public_url=str(msg_doc.get("fileUrl") or ""),
                    scope="chat_group",
                    room_id=room_id,
                    user_id=uid,
                )
        except Exception:
            logger.exception("Failed to register chat attachment asset")

    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room")},
        {"$set": {"lastMessage": {
            "content": content,
            "senderId": uid,
            "sentAt": now,
            "readBy": [uid],
        }}},
    )

    await manager.broadcast_to_room(
        room.get("members", []),
        {"type": "new_message", "message": msg_doc},
        exclude=uid,
    )

    return {"ok": True, "message": msg_doc}


@chat_router.post("/rooms/{room_id}/read")
async def mark_read(room_id: str, user: dict = Depends(get_current_user)):
    """Mark all messages in a room as read by current user."""
    uid = str(user["id"])
    await db.chat_messages.update_many(
        {"roomId": room_id, "readBy": {"$ne": uid}},
        {"$addToSet": {"readBy": uid}},
    )
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room"), "lastMessage": {"$type": "object"}},
        {"$addToSet": {"lastMessage.readBy": uid}},
    )
    return {"ok": True}


@chat_router.post("/messages/{message_id}/recall")
async def recall_message(message_id: str, user: dict = Depends(get_current_user)):
    """Recall (delete for everyone) a message within 2 minutes of sending."""
    uid = str(user["id"])
    msg = await db.chat_messages.find_one({"_id": safe_object_id(message_id, label="message")})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("senderId") != uid:
        raise HTTPException(status_code=403, detail="Can only recall your own messages")

    sent_at = datetime.fromisoformat(msg["sentAt"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - sent_at > timedelta(seconds=120):
        raise HTTPException(status_code=403, detail="Cannot recall after 2 minutes")

    await db.chat_messages.update_one(
        {"_id": safe_object_id(message_id, label="message")},
        {"$set": {"recalled": True, "content": "This message was recalled"}},
    )

    room = await db.chat_rooms.find_one({"_id": safe_object_id(msg["roomId"], label="room"), "members": uid})
    if room:
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "message_recalled", "roomId": msg["roomId"], "messageId": message_id},
        )

    return {"ok": True}


@chat_router.post("/messages/translate")
async def translate_message(
    body: ChatTranslateSchema,
    user: dict = Depends(get_current_user),
):
    """Translate message text using AI gateway."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text to translate")

    lang_map = {
        "en": "English", "zh": "Chinese (Simplified)", "ja": "Japanese",
        "ko": "Korean", "fr": "French", "de": "German", "es": "Spanish",
    }
    lang_name = lang_map.get(body.targetLang, body.targetLang)

    from backend.services.ai_gateway_service import AIGatewayService
    resolved_provider = resolve_provider(body.provider, feature="chat.translate", user=user)
    svc = AIGatewayService()
    prompt = f"Translate the following text to {lang_name}. Return ONLY the translation, no explanation:\n\n{text}"
    result = await svc.chat_with_provider(message=prompt, context=None, provider=resolved_provider)
    return {"ok": True, "translated": result.strip()}


@chat_router.post("/messages/batch-delete")
async def batch_delete_messages(
    body: ChatBatchDeleteSchema,
    user: dict = Depends(get_current_user),
):
    """Mark messages as deleted for the current user (hide from their view)."""
    uid = str(user["id"])
    if not body.messageIds:
        raise HTTPException(status_code=400, detail="No messages specified")
    if len(body.messageIds) > 100:
        raise HTTPException(status_code=400, detail="Too many messages (max 100)")

    oids = [safe_object_id(mid, label="message") for mid in body.messageIds]
    await db.chat_messages.update_many(
        {"_id": {"$in": oids}},
        {"$addToSet": {"deletedFor": uid}},
    )
    return {"ok": True, "deleted": len(body.messageIds)}


@chat_router.post("/rooms/{room_id}/forward")
async def forward_messages(
    room_id: str,
    body: ChatForwardSchema,
    user: dict = Depends(get_current_user),
):
    """Forward messages to another room."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Target room not found")
    if not body.messageIds:
        raise HTTPException(status_code=400, detail="No messages to forward")
    if len(body.messageIds) > 50:
        raise HTTPException(status_code=400, detail="Too many messages (max 50)")

    oids = [safe_object_id(mid, label="message") for mid in body.messageIds]
    originals = []
    async for doc in db.chat_messages.find({"_id": {"$in": oids}}).sort("sentAt", 1):
        originals.append(doc)

    now = _utcnow()
    forwarded_docs = []
    for orig in originals:
        forwarded_docs.append({
            "roomId": room_id,
            "senderId": uid,
            "senderName": user.get("username", ""),
            "content": orig.get("content", ""),
            "type": "text",
            "messageType": orig.get("messageType", "text"),
            "fileUrl": orig.get("fileUrl"),
            "fileName": orig.get("fileName"),
            "fileSize": orig.get("fileSize"),
            "mimeType": orig.get("mimeType"),
            "replyTo": None,
            "forwardedFrom": orig.get("senderName", ""),
            "recalled": False,
            "readBy": [uid],
            "deletedFor": [],
            "sentAt": now,
        })

    forwarded = []
    if forwarded_docs:
        result = await db.chat_messages.insert_many(forwarded_docs)
        for doc, inserted_id in zip(forwarded_docs, result.inserted_ids):
            doc["id"] = str(inserted_id)
            doc.pop("_id", None)
            forwarded.append(doc)

    if forwarded:
        last = forwarded[-1]
        await db.chat_rooms.update_one(
            {"_id": safe_object_id(room_id, label="room")},
            {"$set": {"lastMessage": {
                "content": last["content"] or "[Forwarded]",
                "senderId": uid,
                "sentAt": now,
                "readBy": [uid],
            }}},
        )
        for msg in forwarded:
            await manager.broadcast_to_room(
                room.get("members", []),
                {"type": "new_message", "message": msg},
                exclude=uid,
            )

    return {"ok": True, "forwarded": len(forwarded)}


@chat_router.post("/rooms/{room_id}/upload")
async def upload_file(
    room_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a file attachment for a chat room message."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    original_name = file.filename or "file"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type .{ext} is not allowed")

    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    sigs = _MAGIC_SIGNATURES.get(ext)
    if sigs:
        if not any(data[:len(sig)] == sig for sig in sigs):
            raise HTTPException(
                status_code=400,
                detail=f"File content does not match .{ext} format (possible disguised file)",
            )

    room_dir = os.path.join(CHAT_FILES_DIR, room_id)
    os.makedirs(room_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(room_dir, safe_name)
    with open(file_path, "wb") as f_out:
        f_out.write(data)

    file_url = f"/static/chat_files/{room_id}/{safe_name}"

    try:
        await register_file_asset(
            file_type="chat_attachment",
            storage_path=_storage_path_from_file_url(file_url),
            size=len(data),
            owner_type="chat_upload",
            owner_id=room_id,
            created_by=uid,
            filename=original_name,
            mime_type=file.content_type or "application/octet-stream",
            course_id=str(room.get("courseId") or ""),
            public_url=file_url,
            scope="chat_group",
            room_id=room_id,
            user_id=uid,
            metadata={"upload_only": True},
        )
    except Exception:
        logger.exception("Failed to register uploaded chat file asset")

    return {
        "ok": True,
        "fileUrl": file_url,
        "fileName": original_name,
        "fileSize": len(data),
        "mimeType": file.content_type or "application/octet-stream",
    }
