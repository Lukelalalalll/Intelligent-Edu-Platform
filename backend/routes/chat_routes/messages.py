"""Message CRUD, recall, translate, batch-delete, and forward endpoints."""

import logging
import os
import uuid

from fastapi import Depends, File, HTTPException, Query, UploadFile

from backend.core.dependencies import get_ai_gateway_service
from backend.core.security import get_current_user
from backend.schemas import (
    ChatBatchDeleteSchema,
    ChatForwardSchema,
    ChatSendMessageSchema,
    ChatTranslateSchema,
)
from backend.services.chat_service.message_service import (
    batch_delete_messages as delete_messages_for_user,
    create_message,
    forward_messages as forward_room_messages,
    list_room_messages,
    mark_room_read,
    recall_message as recall_room_message,
    translate_message_text,
)
from backend.services.chat_service.query_service import get_room_for_member
from backend.services.file_asset_service import register_file_asset

from .router import (
    ALLOWED_EXTENSIONS,
    CHAT_FILES_DIR,
    MAX_UPLOAD_SIZE,
    _MAGIC_SIGNATURES,
    _storage_path_from_file_url,
    chat_router,
    manager,
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
    return await list_room_messages(
        room_id=room_id,
        user_id=str(user["id"]),
        before=before,
        limit=limit,
    )


@chat_router.post("/rooms/{room_id}/messages")
async def send_message_rest(
    room_id: str,
    body: ChatSendMessageSchema,
    user: dict = Depends(get_current_user),
):
    """REST fallback for sending a message when WebSocket is unavailable."""
    result = await create_message(
        room_id=room_id,
        user=user,
        content=body.content or "",
        message_type=body.messageType or "text",
        file_url=body.fileUrl,
        file_name=body.fileName,
        file_size=body.fileSize,
        mime_type=body.mimeType,
        reply_to_id=body.replyTo,
        storage_path=_storage_path_from_file_url(body.fileUrl or ""),
    )
    room = result["room"]
    message = result["message"]

    await manager.broadcast_to_room(
        room.get("members", []),
        {"type": "new_message", "message": message},
        exclude=str(user["id"]),
    )
    return {"ok": True, "message": message}


@chat_router.post("/rooms/{room_id}/read")
async def mark_read(room_id: str, user: dict = Depends(get_current_user)):
    """Mark all messages in a room as read by current user."""
    await mark_room_read(room_id=room_id, user_id=str(user["id"]))
    return {"ok": True}


@chat_router.post("/messages/{message_id}/recall")
async def recall_message(message_id: str, user: dict = Depends(get_current_user)):
    """Recall (delete for everyone) a message within 2 minutes of sending."""
    result = await recall_room_message(message_id=message_id, user_id=str(user["id"]))
    room = result["room"]
    if room:
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "message_recalled", "roomId": result["roomId"], "messageId": message_id},
        )
    return {"ok": True}


@chat_router.post("/messages/translate")
async def translate_message(
    body: ChatTranslateSchema,
    user: dict = Depends(get_current_user),
    ai_service=Depends(get_ai_gateway_service),
):
    """Translate message text using AI gateway."""
    translated = await translate_message_text(
        text=body.text,
        target_lang=body.targetLang,
        provider=body.provider,
        user=user,
        ai_service=ai_service,
    )
    return {"ok": True, "translated": translated}


@chat_router.post("/messages/batch-delete")
async def batch_delete_messages(
    body: ChatBatchDeleteSchema,
    user: dict = Depends(get_current_user),
):
    """Mark messages as deleted for the current user (hide from their view)."""
    deleted = await delete_messages_for_user(message_ids=body.messageIds, user_id=str(user["id"]))
    return {"ok": True, "deleted": deleted}


@chat_router.post("/rooms/{room_id}/forward")
async def forward_messages(
    room_id: str,
    body: ChatForwardSchema,
    user: dict = Depends(get_current_user),
):
    """Forward messages to another room."""
    result = await forward_room_messages(room_id=room_id, message_ids=body.messageIds, user=user)
    room = result["room"]
    forwarded = result["forwarded"]

    for message in forwarded:
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "new_message", "message": message},
            exclude=str(user["id"]),
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
    room = await get_room_for_member(room_id, uid)

    original_name = file.filename or "file"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type .{ext} is not allowed")

    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    sigs = _MAGIC_SIGNATURES.get(ext)
    if sigs and not any(data[: len(sig)] == sig for sig in sigs):
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match .{ext} format (possible disguised file)",
        )

    room_dir = os.path.join(CHAT_FILES_DIR, room_id)
    os.makedirs(room_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(room_dir, safe_name)
    with open(file_path, "wb") as file_out:
        file_out.write(data)

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
