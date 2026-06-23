from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from backend.core.ai_provider import resolve_provider
from backend.core.database import db
from backend.core.utils import safe_object_id
from backend.services.files.file_asset_service import register_file_asset

from .query_service import get_message_by_id, get_room_for_member, serialize_doc, utcnow_iso

logger = logging.getLogger(__name__)


async def list_room_messages(
    *,
    room_id: str,
    user_id: str,
    before: str | None,
    limit: int,
) -> dict[str, Any]:
    await get_room_for_member(room_id, user_id)

    query: dict[str, Any] = {"roomId": room_id, "deletedFor": {"$ne": user_id}}
    if before:
        query["sentAt"] = {"$lt": before}

    messages = [serialize_doc(doc) async for doc in db.chat_messages.find(query).sort("sentAt", -1).limit(limit + 1)]
    has_more = len(messages) > limit
    messages = messages[:limit]
    messages.reverse()
    return {"messages": messages, "hasMore": has_more}


async def create_message(
    *,
    room_id: str,
    user: dict[str, Any],
    content: str,
    message_type: str,
    file_url: str | None = None,
    file_name: str | None = None,
    file_size: int | None = None,
    mime_type: str | None = None,
    reply_to_id: str | None = None,
    storage_path: str = "",
) -> dict[str, Any]:
    user_id = str(user["id"])
    normalized_content = str(content or "").strip()
    normalized_message_type = str(message_type or "text")
    if not normalized_content and normalized_message_type == "text":
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    room = await get_room_for_member(room_id, user_id)

    reply_to = None
    if reply_to_id:
        ref = await get_message_by_id(reply_to_id)
        if ref:
            reply_to = {
                "id": str(ref["_id"]),
                "senderName": ref.get("senderName", ""),
                "content": (ref.get("content", "") or "")[:120],
            }

    now = utcnow_iso()
    msg_doc = {
        "roomId": room_id,
        "senderId": user_id,
        "senderName": user.get("username", ""),
        "content": normalized_content,
        "type": "text",
        "messageType": normalized_message_type,
        "fileUrl": file_url,
        "fileName": file_name,
        "fileSize": file_size,
        "mimeType": mime_type,
        "replyTo": reply_to,
        "recalled": False,
        "readBy": [user_id],
        "deletedFor": [],
        "sentAt": now,
    }
    result = await db.chat_messages.insert_one(msg_doc)
    msg_doc["id"] = str(result.inserted_id)
    msg_doc.pop("_id", None)

    if file_url:
        try:
            matched = await db.file_assets.update_one(
                {
                    "file_type": "chat_attachment",
                    "public_url": str(file_url),
                    "status": {"$ne": "hard_deleted"},
                },
                {
                    "$set": {
                        "owner_type": "chat_message",
                        "owner_id": msg_doc["id"],
                        "scope": "chat_group",
                        "room_id": room_id,
                        "user_id": user_id,
                        "updated_at": datetime.now(timezone.utc),
                        "status": "active",
                    }
                },
            )
            if matched.matched_count == 0:
                await register_file_asset(
                    file_type="chat_attachment",
                    storage_path=storage_path,
                    size=int(file_size or 0),
                    owner_type="chat_message",
                    owner_id=msg_doc["id"],
                    created_by=user_id,
                    filename=str(file_name or ""),
                    mime_type=str(mime_type or ""),
                    course_id=str(room.get("courseId") or ""),
                    public_url=str(file_url),
                    scope="chat_group",
                    room_id=room_id,
                    user_id=user_id,
                )
        except Exception:
            logger.exception("Failed to register chat attachment asset")

    await db.chat_rooms.update_one(
        {"_id": room["_id"]},
        {
            "$set": {
                "lastMessage": {
                    "content": normalized_content,
                    "senderId": user_id,
                    "sentAt": now,
                    "readBy": [user_id],
                }
            }
        },
    )
    return {"room": room, "message": msg_doc}


async def mark_room_read(*, room_id: str, user_id: str) -> None:
    await db.chat_messages.update_many(
        {"roomId": room_id, "readBy": {"$ne": user_id}},
        {"$addToSet": {"readBy": user_id}},
    )
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room"), "lastMessage": {"$type": "object"}},
        {"$addToSet": {"lastMessage.readBy": user_id}},
    )


async def mark_room_read_for_member(*, room_id: str, user_id: str) -> dict[str, Any]:
    room = await get_room_for_member(room_id, user_id)
    await mark_room_read(room_id=room_id, user_id=user_id)
    return room


def _parse_message_timestamp(raw_value: Any) -> datetime:
    if isinstance(raw_value, datetime):
        return raw_value.astimezone(timezone.utc)
    if isinstance(raw_value, str):
        return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).astimezone(timezone.utc)
    raise HTTPException(status_code=400, detail="Invalid message timestamp")


async def recall_message(*, message_id: str, user_id: str) -> dict[str, Any]:
    msg = await get_message_by_id(message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("senderId") != user_id:
        raise HTTPException(status_code=403, detail="Can only recall your own messages")

    sent_at = _parse_message_timestamp(msg.get("sentAt"))
    if datetime.now(timezone.utc) - sent_at > timedelta(seconds=120):
        raise HTTPException(status_code=403, detail="Cannot recall after 2 minutes")

    await db.chat_messages.update_one(
        {"_id": msg["_id"]},
        {"$set": {"recalled": True, "content": "This message was recalled"}},
    )

    room = await get_room_for_member(str(msg.get("roomId", "")), user_id, raise_not_found=False)
    return {"room": room, "roomId": str(msg.get("roomId", ""))}


async def translate_message_text(
    *,
    text: str,
    target_lang: str,
    provider,
    user: dict[str, Any],
    ai_service,
) -> str:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        raise HTTPException(status_code=400, detail="No text to translate")

    lang_map = {
        "en": "English",
        "zh": "Chinese (Simplified)",
        "ja": "Japanese",
        "ko": "Korean",
        "fr": "French",
        "de": "German",
        "es": "Spanish",
    }
    resolved_provider = resolve_provider(provider, feature="chat.translate", user=user)
    lang_name = lang_map.get(target_lang, target_lang)
    prompt = (
        f"Translate the following text to {lang_name}. "
        f"Return ONLY the translation, no explanation:\n\n{normalized_text}"
    )
    result = await ai_service.chat_with_provider(message=prompt, context=None, provider=resolved_provider)
    return str(result).strip()


async def batch_delete_messages(*, message_ids: list[str], user_id: str) -> int:
    if not message_ids:
        raise HTTPException(status_code=400, detail="No messages specified")
    if len(message_ids) > 100:
        raise HTTPException(status_code=400, detail="Too many messages (max 100)")

    message_oids = [get_message_oid(message_id) for message_id in message_ids]
    await db.chat_messages.update_many({"_id": {"$in": message_oids}}, {"$addToSet": {"deletedFor": user_id}})
    return len(message_ids)


def get_message_oid(message_id: str):
    return safe_object_id(message_id, label="message")


async def forward_messages(
    *,
    room_id: str,
    message_ids: list[str],
    user: dict[str, Any],
) -> dict[str, Any]:
    room = await get_room_for_member(room_id, str(user["id"]))
    if not message_ids:
        raise HTTPException(status_code=400, detail="No messages to forward")
    if len(message_ids) > 50:
        raise HTTPException(status_code=400, detail="Too many messages (max 50)")

    message_oids = [get_message_oid(message_id) for message_id in message_ids]
    originals = [doc async for doc in db.chat_messages.find({"_id": {"$in": message_oids}}).sort("sentAt", 1)]

    now = utcnow_iso()
    forwarded_docs = []
    for original in originals:
        forwarded_docs.append(
            {
                "roomId": room_id,
                "senderId": str(user["id"]),
                "senderName": user.get("username", ""),
                "content": original.get("content", ""),
                "type": "text",
                "messageType": original.get("messageType", "text"),
                "fileUrl": original.get("fileUrl"),
                "fileName": original.get("fileName"),
                "fileSize": original.get("fileSize"),
                "mimeType": original.get("mimeType"),
                "replyTo": None,
                "forwardedFrom": original.get("senderName", ""),
                "recalled": False,
                "readBy": [str(user["id"])],
                "deletedFor": [],
                "sentAt": now,
            }
        )

    forwarded: list[dict[str, Any]] = []
    if forwarded_docs:
        result = await db.chat_messages.insert_many(forwarded_docs)
        for doc, inserted_id in zip(forwarded_docs, result.inserted_ids):
            doc["id"] = str(inserted_id)
            doc.pop("_id", None)
            forwarded.append(doc)

    if forwarded:
        last = forwarded[-1]
        await db.chat_rooms.update_one(
            {"_id": room["_id"]},
            {
                "$set": {
                    "lastMessage": {
                        "content": last["content"] or "[Forwarded]",
                        "senderId": str(user["id"]),
                        "sentAt": now,
                        "readBy": [str(user["id"])],
                    }
                }
            },
        )

    return {"room": room, "forwarded": forwarded}

