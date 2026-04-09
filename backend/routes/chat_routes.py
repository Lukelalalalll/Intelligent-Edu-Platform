# backend/routes/chat_routes.py
"""Chat feature: contacts, rooms, messages and realtime WebSocket."""

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from jose import jwt, JWTError

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import db
from backend.core.security import get_current_user
from backend.core.utils import safe_object_id
from backend.schemas import (
    ChatSendMessageSchema,
    ChatCreateRoomSchema,
    ChatFriendRequestSchema,
    ChatCreateDirectRoomSchema,
    ChatCreateCourseGroupSchema,
    ChatTranslateSchema,
    ChatBatchDeleteSchema,
    ChatForwardSchema,
    ChatAiSummarySchema,
    ChatAiReplySuggestionsSchema,
    ChatAiRewriteSchema,
    ChatAiAssistantSchema,
    ChatTransferStartSchema,
)
from backend.services.chat_search_service import sanitize_user_search_query
from backend.services.file_asset_service import register_file_asset

# Allowed file types for chat uploads
ALLOWED_EXTENSIONS = {
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls',
    'md', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'
}
# Magic bytes for content-based validation
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    'pdf': [b'%PDF'],
    'png': [b'\x89PNG'],
    'jpg': [b'\xff\xd8\xff'],
    'jpeg': [b'\xff\xd8\xff'],
    'gif': [b'GIF87a', b'GIF89a'],
    'zip': [b'PK\x03\x04', b'PK\x05\x06'],
    'docx': [b'PK\x03\x04'],  # OOXML uses ZIP container
    'pptx': [b'PK\x03\x04'],
    'xlsx': [b'PK\x03\x04'],
    'doc': [b'\xd0\xcf\x11\xe0'],  # OLE2
    'ppt': [b'\xd0\xcf\x11\xe0'],
    'xls': [b'\xd0\xcf\x11\xe0'],
    'webp': [b'RIFF'],
}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB
CHAT_FILES_DIR = os.path.join(Config.BASE_DIR, 'static', 'chat_files')
os.makedirs(CHAT_FILES_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api/chat", tags=["Chat"])


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _str_id(doc: dict) -> dict:
    """Convert MongoDB _id to string id field."""
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


def _storage_path_from_file_url(file_url: str) -> str:
    return str(file_url or "").strip().lstrip("/")


# ──────────────────────────────────────────────────────────────
# Contacts (Friend System)
# ──────────────────────────────────────────────────────────────

@chat_router.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    """Get accepted contacts for current user."""
    uid = str(user["id"])
    cursor = db.chat_contacts.find({
        "$or": [
            {"userId": uid, "status": "accepted"},
            {"contactId": uid, "status": "accepted"},
        ]
    })
    # Collect all other-user IDs first, then batch-fetch
    other_ids: list[str] = []
    async for doc in cursor:
        other_id = doc["contactId"] if doc["userId"] == uid else doc["userId"]
        other_ids.append(other_id)

    if not other_ids:
        return {"contacts": []}

    # Batch lookup
    oid_list = [ObjectId(oid) for oid in other_ids]
    user_map: dict[str, dict] = {}
    async for u in db.users.find({"_id": {"$in": oid_list}}, {"_id": 1, "username": 1, "email": 1, "role": 1}):
        user_map[str(u["_id"])] = u

    contacts = []
    for oid in other_ids:
        u = user_map.get(oid)
        if u:
            contacts.append({
                "id": oid,
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", "student"),
            })
    return {"contacts": contacts}


@chat_router.post("/contacts/request")
async def send_friend_request(body: ChatFriendRequestSchema, user: dict = Depends(get_current_user)):
    """Send a friend request to another user by username."""
    uid = str(user["id"])
    target = await db.users.find_one({"username": body.targetUsername})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_id = str(target["_id"])
    if target_id == uid:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    # Check if already friends or pending
    existing = await db.chat_contacts.find_one({
        "$or": [
            {"userId": uid, "contactId": target_id},
            {"userId": target_id, "contactId": uid},
        ]
    })
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        if existing["status"] == "pending":
            raise HTTPException(status_code=400, detail="Friend request already pending")

    now = _utcnow()
    await db.chat_contacts.insert_one({
        "userId": uid,
        "contactId": target_id,
        "status": "pending",
        "createdAt": now,
        "updatedAt": now,
    })

    # Notify target via WebSocket if online
    await _ws_send_to_user(target_id, {
        "type": "friend_request",
        "from": {"id": uid, "username": user.get("username", "")},
        "sentAt": now,
    })

    return {"ok": True, "message": "Friend request sent"}


@chat_router.get("/contacts/requests")
async def get_friend_requests(user: dict = Depends(get_current_user)):
    """Get pending friend requests received by current user."""
    uid = str(user["id"])
    cursor = db.chat_contacts.find({"contactId": uid, "status": "pending"})
    # Collect all sender IDs first
    docs = []
    sender_ids: list[str] = []
    async for doc in cursor:
        docs.append(doc)
        sender_ids.append(doc["userId"])

    if not docs:
        return {"requests": []}

    # Batch-fetch sender info
    oid_list = [ObjectId(sid) for sid in sender_ids]
    sender_map: dict[str, dict] = {}
    async for u in db.users.find({"_id": {"$in": oid_list}}, {"_id": 1, "username": 1, "email": 1, "role": 1}):
        sender_map[str(u["_id"])] = u

    requests = []
    for doc in docs:
        sender = sender_map.get(doc["userId"])
        if sender:
            requests.append({
                "id": str(doc["_id"]),
                "fromId": doc["userId"],
                "fromUsername": sender.get("username", ""),
                "fromEmail": sender.get("email", ""),
                "fromRole": sender.get("role", "student"),
                "sentAt": doc.get("createdAt", ""),
            })
    return {"requests": requests}


@chat_router.post("/contacts/{contact_id}/accept")
async def accept_friend_request(contact_id: str, user: dict = Depends(get_current_user)):
    """Accept a pending friend request."""
    uid = str(user["id"])
    result = await db.chat_contacts.update_one(
        {"_id": safe_object_id(contact_id, label="contact"), "contactId": uid, "status": "pending"},
        {"$set": {"status": "accepted", "updatedAt": _utcnow()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or already accepted")

    # Notify the requester
    doc = await db.chat_contacts.find_one({"_id": safe_object_id(contact_id, label="contact")})
    if doc:
        await _ws_send_to_user(doc["userId"], {
            "type": "friend_accepted",
            "by": {"id": uid, "username": user.get("username", "")},
        })

    return {"ok": True}


@chat_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    """Delete or reject a contact / friend request."""
    uid = str(user["id"])
    result = await db.chat_contacts.delete_one({
        "_id": safe_object_id(contact_id, label="contact"),
        "$or": [{"userId": uid}, {"contactId": uid}],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


@chat_router.get("/users/search")
async def search_users(q: str = Query(..., min_length=1, max_length=50), user: dict = Depends(get_current_user)):
    """Search platform users by username (for adding friends)."""
    uid = str(user["id"])
    try:
        safe_pattern = sanitize_user_search_query(q)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cursor = db.users.find(
        {"username": {"$regex": safe_pattern, "$options": "i"}},
        {"_id": 1, "username": 1, "email": 1, "role": 1},
    ).limit(20)
    users = []
    async for u in cursor:
        u_id = str(u["_id"])
        if u_id == uid:
            continue
        users.append({
            "id": u_id,
            "username": u.get("username", ""),
            "email": u.get("email", ""),
            "role": u.get("role", "student"),
        })
    return {"users": users}


# ──────────────────────────────────────────────────────────────
# Rooms
# ──────────────────────────────────────────────────────────────

@chat_router.get("/rooms")
async def get_rooms(user: dict = Depends(get_current_user)):
    """Get all chat rooms the current user is a member of."""
    uid = str(user["id"])
    cursor = db.chat_rooms.find({"members": uid}).sort("createdAt", -1)
    rooms = []
    other_user_ids: set[str] = set()

    async for doc in cursor:
        room = _str_id(doc)
        if room.get("type") == "direct" and not room.get("name"):
            members = room.get("members", [])
            other_id = next((m for m in members if m != uid), None)
            if other_id:
                other_user_ids.add(other_id)
        rooms.append(room)

    # Batch-fetch other user names for direct rooms
    user_name_map: dict[str, str] = {}
    if other_user_ids:
        oids = [ObjectId(uid_) for uid_ in other_user_ids]
        async for u in db.users.find({"_id": {"$in": oids}}, {"_id": 1, "username": 1}):
            user_name_map[str(u["_id"])] = u.get("username", "Unknown")

    # Batch-count unread messages per room using aggregation
    room_ids = [r["id"] for r in rooms]
    unread_map: dict[str, int] = {}
    if room_ids:
        pipeline = [
            {"$match": {"roomId": {"$in": room_ids}, "readBy": {"$ne": uid}, "senderId": {"$ne": uid}}},
            {"$group": {"_id": "$roomId", "count": {"$sum": 1}}},
        ]
        async for doc in db.chat_messages.aggregate(pipeline):
            unread_map[doc["_id"]] = doc["count"]

    for room in rooms:
        # Populate direct room names
        if room.get("type") == "direct" and not room.get("name"):
            members = room.get("members", [])
            other_id = next((m for m in members if m != uid), None)
            if other_id:
                room["name"] = user_name_map.get(other_id, "Unknown")
        # Set unread count from aggregation result
        room["unreadCount"] = unread_map.get(room["id"], 0)

    return {"rooms": rooms}


@chat_router.post("/rooms")
async def create_group_room(body: ChatCreateRoomSchema, user: dict = Depends(get_current_user)):
    """Create a group chat room."""
    uid = str(user["id"])
    member_ids = list(set([uid] + body.memberIds))
    if len(member_ids) < 3:
        raise HTTPException(status_code=400, detail="Group chat requires at least 3 members (you + 2)")

    # Validate all memberIds exist in the users collection
    other_ids = [mid for mid in member_ids if mid != uid]
    if other_ids:
        valid_oids = []
        for mid in other_ids:
            try:
                valid_oids.append(ObjectId(mid))
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid member ID: {mid}")
        found_count = await db.users.count_documents({"_id": {"$in": valid_oids}})
        if found_count != len(valid_oids):
            raise HTTPException(status_code=400, detail="One or more member IDs do not exist")

    now = _utcnow()
    result = await db.chat_rooms.insert_one({
        "type": "group",
        "name": body.name.strip(),
        "members": member_ids,
        "createdBy": uid,
        "avatarColor": _hash_color(body.name),
        "createdAt": now,
        "lastMessage": None,
    })

    room_id = str(result.inserted_id)

    # Insert a system message
    await db.chat_messages.insert_one({
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": f"{user.get('username', '')} created the group \"{body.name.strip()}\"",
        "type": "system",
        "readBy": [uid],
        "sentAt": now,
    })

    return {"ok": True, "roomId": room_id}


@chat_router.post("/rooms/direct")
async def create_or_get_direct_room(body: ChatCreateDirectRoomSchema, user: dict = Depends(get_current_user)):
    """Find or create a direct message room between two users (atomic upsert)."""
    uid = str(user["id"])
    target_id = body.targetUserId
    if target_id == uid:
        raise HTTPException(status_code=400, detail="Cannot create DM with yourself")

    # Normalised pair key to guarantee uniqueness regardless of who initiates
    pair_key = "|".join(sorted([uid, target_id]))
    now = _utcnow()

    # Atomic find-or-create using the unique directPairKey index
    from pymongo import ReturnDocument
    doc = await db.chat_rooms.find_one_and_update(
        {"directPairKey": pair_key, "type": "direct"},
        {"$setOnInsert": {
            "type": "direct",
            "name": None,
            "members": sorted([uid, target_id]),
            "directPairKey": pair_key,
            "createdBy": uid,
            "avatarColor": None,
            "createdAt": now,
            "lastMessage": None,
        }},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"ok": True, "roomId": str(doc["_id"])}


# ──────────────────────────────────────────────────────────────
# Messages
# ──────────────────────────────────────────────────────────────

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
    messages.reverse()  # Return in chronological order
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

    # Build replyTo snapshot if quoting a message
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

    # Broadcast to other room members via WS (if they're online)
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
    # Also update lastMessage.readBy in room doc so ContactItem can show read tick
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room"), "lastMessage": {"$exists": True}},
        {"$addToSet": {"lastMessage.readBy": uid}},
    )
    return {"ok": True}


# ──────────────────────────────────────────────────────────────
# Message Recall
# ──────────────────────────────────────────────────────────────

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

    # Broadcast recall event to all room members
    room = await db.chat_rooms.find_one({"_id": safe_object_id(msg["roomId"], label="room"), "members": uid})
    if room:
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "message_recalled", "roomId": msg["roomId"], "messageId": message_id},
        )

    return {"ok": True}


# ──────────────────────────────────────────────────────────────
# Translate
# ──────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────
# Batch Delete (for me)
# ──────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────
# Forward Messages
# ──────────────────────────────────────────────────────────────

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

    # Fetch original messages in order
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

    # Update lastMessage for target room
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
        # Broadcast each forwarded message to room members
        for msg in forwarded:
            await manager.broadcast_to_room(
                room.get("members", []),
                {"type": "new_message", "message": msg},
                exclude=uid,
            )

    return {"ok": True, "forwarded": len(forwarded)}


# ──────────────────────────────────────────────────────────────
# File Upload
# ──────────────────────────────────────────────────────────────

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

    # Extension whitelist
    original_name = file.filename or "file"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type .{ext} is not allowed")

    # Read and check size
    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    # Magic-number validation for binary types (skip for plain text formats)
    sigs = _MAGIC_SIGNATURES.get(ext)
    if sigs:
        if not any(data[:len(sig)] == sig for sig in sigs):
            raise HTTPException(
                status_code=400,
                detail=f"File content does not match .{ext} format (possible disguised file)",
            )

    # Save to static/chat_files/{room_id}/
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


# ──────────────────────────────────────────────────────────────
# Course Group Chat
# ──────────────────────────────────────────────────────────────

@chat_router.post("/rooms/from-course")
async def create_room_from_course(
    body: ChatCreateCourseGroupSchema,
    user: dict = Depends(get_current_user),
):
    """Create (or return existing) a group chat room for a course."""
    uid = str(user["id"])
    role = user.get("role", "student")

    # Prefer v2 course section id, fall back to legacy courses collection.
    section = None
    if ObjectId.is_valid(body.courseId):
        section = await db.course_sections.find_one({"_id": ObjectId(body.courseId)})

    legacy_course = None
    if not section:
        if ObjectId.is_valid(body.courseId):
            legacy_course = await db.courses.find_one({"_id": ObjectId(body.courseId)})
        if not legacy_course:
            legacy_course = await db.courses.find_one({"courseId": body.courseId})

    if not section and not legacy_course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Resolve course identity and permissions.
    if section:
        course_identity = str(section["_id"])
        course_name = section.get("courseName") or section.get("courseCode") or "Course"
        owner_teacher_id = str(section.get("ownerTeacherId", ""))
        enrollment = await db.enrollments.find_one({"courseSectionId": course_identity, "userId": uid})
        if role != "admin" and uid != owner_teacher_id and not enrollment:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")

        member_ids_set: set[str] = set()
        async for enroll in db.enrollments.find({"courseSectionId": course_identity}, {"userId": 1}):
            user_id = str(enroll.get("userId", "")).strip()
            if user_id:
                member_ids_set.add(user_id)
        if owner_teacher_id:
            member_ids_set.add(owner_teacher_id)
    else:
        course_identity = str(legacy_course["_id"]) if "_id" in legacy_course else body.courseId
        course_name = legacy_course.get("name") or legacy_course.get("title") or legacy_course.get("courseId") or "Course"
        teacher_id = str(legacy_course.get("teacherId", ""))
        if role != "admin" and uid != teacher_id:
            raise HTTPException(status_code=403, detail="Only course members can create this group")

        member_ids_set: set[str] = {teacher_id} if teacher_id else set()
        # Legacy enrollments schema fallback.
        async for enroll in db.enrollments.find({"courseId": body.courseId}, {"userId": 1}):
            user_id = str(enroll.get("userId", "")).strip()
            if user_id:
                member_ids_set.add(user_id)

    member_ids_set.add(uid)
    member_ids = sorted(member_ids_set)
    now = _utcnow()

    # Atomic find-or-create using unique courseId+type index
    from pymongo import ReturnDocument
    doc = await db.chat_rooms.find_one_and_update(
        {"courseId": course_identity, "type": "group"},
        {"$setOnInsert": {
            "type": "group",
            "name": f"{course_name} 群聊",
            "members": member_ids,
            "createdBy": uid,
            "courseId": course_identity,
            "avatarColor": _hash_color(course_name),
            "createdAt": now,
            "lastMessage": None,
        }},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    room_id = str(doc["_id"])
    is_existing = doc.get("createdAt") != now
    if is_existing:
        return {"ok": True, "roomId": room_id, "isExisting": True}

    # System message
    await db.chat_messages.insert_one({
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": f'Group chat created for course "{course_name}"',
        "type": "system",
        "messageType": "text",
        "recalled": False,
        "readBy": [uid],
        "sentAt": now,
    })

    # Notify all members via WS
    new_room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room")})
    if new_room:
        new_room = _str_id(new_room)
        await manager.broadcast_to_room(
            member_ids,
            {"type": "room_created", "room": new_room},
            exclude=uid,
        )

    return {"ok": True, "roomId": room_id, "isExisting": False}


@chat_router.get("/rooms/from-course/list")
async def list_courses_for_group(user: dict = Depends(get_current_user)):
    """List courses the current user can create group chats for."""
    uid = str(user["id"])
    role = user.get("role", "student")
    courses = []

    section_ids: set[str] = set()

    if role == "admin":
        async for sec in db.course_sections.find({}, {"_id": 1}):
            section_ids.add(str(sec["_id"]))
    else:
        # Any enrolled user should see their course groups (teacher/student).
        async for enroll in db.enrollments.find({"userId": uid}, {"courseSectionId": 1}):
            sid = str(enroll.get("courseSectionId", "")).strip()
            if sid:
                section_ids.add(sid)

        # Owner teacher should also see owned sections.
        if role in ("teacher", "ta"):
            async for sec in db.course_sections.find({"ownerTeacherId": uid}, {"_id": 1}):
                section_ids.add(str(sec["_id"]))

    if section_ids:
        oid_ids = [ObjectId(sid) for sid in section_ids if ObjectId.is_valid(sid)]
        async for c in db.course_sections.find(
            {"_id": {"$in": oid_ids}},
            {"_id": 1, "courseCode": 1, "courseName": 1},
        ):
            c_id = str(c["_id"])
            existing = await db.chat_rooms.find_one({"courseId": c_id, "type": "group"}, {"_id": 1})
            display_name = c.get("courseName") or c.get("courseCode") or "Untitled"
            courses.append({
                "id": c_id,
                "name": display_name,
                "existingRoomId": str(existing["_id"]) if existing else None,
            })

    # Legacy fallback so old teacher-only data still appears when v2 is empty.
    if not courses and role in ("teacher", "admin"):
        q = {} if role == "admin" else {"teacherId": uid}
        async for c in db.courses.find(q, {"_id": 1, "name": 1, "title": 1}):
            c_id = str(c["_id"])
            existing = await db.chat_rooms.find_one({"courseId": c_id, "type": "group"}, {"_id": 1})
            courses.append({
                "id": c_id,
                "name": c.get("name") or c.get("title") or "Untitled",
                "existingRoomId": str(existing["_id"]) if existing else None,
            })
    return {"courses": courses}


# ──────────────────────────────────────────────────────────────
# Group Management
# ──────────────────────────────────────────────────────────────

@chat_router.get("/rooms/{room_id}/info")
async def get_room_info(room_id: str, user: dict = Depends(get_current_user)):
    """Get detailed room info including member profiles."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    room_data = _str_id(room)

    # Batch-fetch member info
    member_ids = room.get("members", [])
    oid_list = [ObjectId(mid) for mid in member_ids if mid]
    members = []
    user_map: dict[str, dict] = {}
    if oid_list:
        async for u in db.users.find({"_id": {"$in": oid_list}}, {"_id": 1, "username": 1, "email": 1, "role": 1}):
            uid_str = str(u["_id"])
            user_map[uid_str] = {
                "id": uid_str,
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", "student"),
            }
    for mid in member_ids:
        if mid in user_map:
            members.append(user_map[mid])

    return {
        "ok": True,
        "room": room_data,
        "members": members,
        "isOwner": room_data.get("createdBy") == uid,
    }


@chat_router.post("/rooms/{room_id}/members/add")
async def add_room_member(room_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Add a member to a group room. Only the owner can add members."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Can only add members to group rooms")
    if room.get("createdBy") != uid:
        raise HTTPException(status_code=403, detail="Only the group owner can add members")

    new_member_id = body.get("userId", "")
    if not new_member_id:
        raise HTTPException(status_code=400, detail="userId is required")

    # Validate user exists
    target = await db.users.find_one({"_id": safe_object_id(new_member_id, label="user")})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if new_member_id in room.get("members", []):
        raise HTTPException(status_code=400, detail="User is already a member")

    now = _utcnow()
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room")},
        {"$addToSet": {"members": new_member_id}},
    )

    # System message
    await db.chat_messages.insert_one({
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": f"{target.get('username', '')} was added to the group",
        "type": "system",
        "messageType": "text",
        "recalled": False,
        "readBy": [uid],
        "deletedFor": [],
        "sentAt": now,
    })

    # Notify via WS
    updated_room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room")})
    if updated_room:
        await manager.broadcast_to_room(
            updated_room.get("members", []),
            {"type": "room_updated", "roomId": room_id},
        )

    return {"ok": True}


@chat_router.post("/rooms/{room_id}/members/kick")
async def kick_room_member(room_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Remove a member from a group room. Only the owner can kick members."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Can only kick members from group rooms")
    if room.get("createdBy") != uid:
        raise HTTPException(status_code=403, detail="Only the group owner can kick members")

    target_id = body.get("userId", "")
    if not target_id:
        raise HTTPException(status_code=400, detail="userId is required")
    if target_id == uid:
        raise HTTPException(status_code=400, detail="Cannot kick yourself — use leave instead")

    if target_id not in room.get("members", []):
        raise HTTPException(status_code=400, detail="User is not a member")

    # Fetch target username for system message
    target = await db.users.find_one({"_id": safe_object_id(target_id, label="user")})
    target_name = target.get("username", "Unknown") if target else "Unknown"

    now = _utcnow()
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room")},
        {"$pull": {"members": target_id}},
    )

    await db.chat_messages.insert_one({
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": f"{target_name} was removed from the group",
        "type": "system",
        "messageType": "text",
        "recalled": False,
        "readBy": [uid],
        "deletedFor": [],
        "sentAt": now,
    })

    # Notify remaining members + kicked user
    await manager.broadcast_to_room(
        room.get("members", []),
        {"type": "room_updated", "roomId": room_id},
    )
    await manager.send_to_user(target_id, {"type": "kicked_from_room", "roomId": room_id})

    return {"ok": True}


@chat_router.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, user: dict = Depends(get_current_user)):
    """Leave a group room. Owner cannot leave (must transfer or delete)."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Cannot leave a direct room — use delete chat instead")
    if room.get("createdBy") == uid:
        raise HTTPException(status_code=400, detail="Group owner cannot leave. Transfer ownership or delete the group.")

    now = _utcnow()
    await db.chat_rooms.update_one(
        {"_id": safe_object_id(room_id, label="room")},
        {"$pull": {"members": uid}},
    )

    await db.chat_messages.insert_one({
        "roomId": room_id,
        "senderId": uid,
        "senderName": user.get("username", ""),
        "content": f"{user.get('username', '')} left the group",
        "type": "system",
        "messageType": "text",
        "recalled": False,
        "readBy": [uid],
        "deletedFor": [],
        "sentAt": now,
    })

    # Notify remaining members
    updated_room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room")})
    if updated_room:
        await manager.broadcast_to_room(
            updated_room.get("members", []),
            {"type": "room_updated", "roomId": room_id},
        )

    return {"ok": True}


@chat_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat room (hide for current user; owner can delete group entirely)."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.get("type") == "direct":
        # For direct rooms, just remove the user from members (soft delete)
        await db.chat_rooms.update_one(
            {"_id": safe_object_id(room_id, label="room")},
            {"$pull": {"members": uid}},
        )
    elif room.get("createdBy") == uid:
        # Owner can delete entire group
        await db.chat_rooms.delete_one({"_id": safe_object_id(room_id, label="room")})
        await db.chat_messages.delete_many({"roomId": room_id})
        # Notify all members
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "room_deleted", "roomId": room_id},
            exclude=uid,
        )
    else:
        raise HTTPException(status_code=403, detail="Only the group owner can delete the group")

    return {"ok": True}


# ──────────────────────────────────────────────────────────────
# AI Assistant Endpoints
# ──────────────────────────────────────────────────────────────

async def _verify_room_member(room_id: str, user_id: str):
    """Helper: verify user is a member of the room, return room doc or raise 404."""
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": user_id})
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

    from backend.services.chat_ai_service import run_summary
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

    from backend.services.chat_ai_service import run_reply_suggestions
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

    from backend.services.chat_ai_service import run_rewrite
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

    from backend.services.chat_ai_service import run_assistant
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


# ──────────────────────────────────────────────────────────────
# File Transfer Station Endpoints
# ──────────────────────────────────────────────────────────────

@chat_router.post("/transfers/start")
async def transfer_start(
    body: ChatTransferStartSchema,
    user: dict = Depends(get_current_user),
):
    """Start a file transfer from a chat message to a target module."""
    uid = str(user["id"])
    await _verify_room_member(body.room_id, uid)

    from backend.services.transfer_dispatch_service import create_transfer
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
    from backend.services.transfer_dispatch_service import get_transfer
    result = await get_transfer(transfer_id, uid)
    if not result:
        raise HTTPException(status_code=404, detail="Transfer not found")

    # Serialize datetimes for JSON response
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
    from backend.services.transfer_dispatch_service import consume_transfer
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
    from backend.services.transfer_dispatch_service import retry_transfer
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


# ──────────────────────────────────────────────────────────────
# WebSocket Connection Manager
# ──────────────────────────────────────────────────────────────

class ConnectionManager:
    """Manage active WebSocket connections per user."""

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        # Close existing connection for same user if any
        if user_id in self._connections:
            try:
                await self._connections[user_id].close()
            except Exception as exc:
                logger.warning("Failed to close old WS connection | user=%s err=%s", user_id, str(exc)[:200])
        self._connections[user_id] = ws

    def disconnect(self, user_id: str):
        self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict):
        ws = self._connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_room(self, room_members: list, data: dict, exclude: str | None = None):
        for member_id in room_members:
            if member_id != exclude:
                await self.send_to_user(member_id, data)


manager = ConnectionManager()


async def _ws_send_to_user(user_id: str, data: dict):
    """Helper to send WS event from REST endpoints."""
    await manager.send_to_user(user_id, data)


def _hash_color(name: str) -> str:
    """Generate a stable HSL color from a string."""
    h = hash(name) % 360
    return f"hsl({h}, 60%, 45%)"


# ──────────────────────────────────────────────────────────────
# WebSocket Endpoint
# ──────────────────────────────────────────────────────────────

async def _authenticate_ws(token: str) -> dict | None:
    """Validate JWT token and return user dict, or None."""
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        from bson import ObjectId as _ObjectId
        user = await db.users.find_one({"_id": _ObjectId(user_id)})
        if not user:
            return None
        user["id"] = str(user["_id"])
        return user
    except (JWTError, Exception):
        return None


@chat_router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    # Read JWT from HttpOnly cookie (browser sends it automatically in the WS upgrade request)
    token = ws.cookies.get(Config.JWT_ACCESS_COOKIE_NAME, "")
    user = await _authenticate_ws(token) if token else None
    if not user:
        await ws.close(code=4001, reason="Unauthorized")
        return

    uid = str(user["id"])
    await manager.connect(uid, ws)
    logger.info("WS connected: user=%s", uid)

    try:
        while True:
            data = await ws.receive_json()
            event_type = data.get("type")

            if event_type == "new_message":
                room_id = data.get("roomId", "")
                content = (data.get("content", "") or "").strip()
                local_id = data.get("localId", "")
                if not room_id or not content:
                    continue

                # Verify membership
                try:
                    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                except HTTPException:
                    continue
                if not room:
                    continue

                # Build replyTo snapshot if quoting
                reply_to = None
                reply_to_id = data.get("replyTo", "")
                if reply_to_id:
                    try:
                        ref = await db.chat_messages.find_one({"_id": safe_object_id(reply_to_id, label="message")})
                    except HTTPException:
                        ref = None
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
                    "messageType": "text",
                    "replyTo": reply_to,
                    "recalled": False,
                    "readBy": [uid],
                    "deletedFor": [],
                    "sentAt": now,
                }
                result = await db.chat_messages.insert_one(msg_doc)
                msg_doc["id"] = str(result.inserted_id)
                msg_doc.pop("_id", None)

                # Update room lastMessage
                try:
                    await db.chat_rooms.update_one(
                        {"_id": safe_object_id(room_id, label="room")},
                    {"$set": {"lastMessage": {
                        "content": content,
                        "senderId": uid,
                        "sentAt": now,
                        "readBy": [uid],
                    }}},
                )
                except HTTPException as exc:
                    logger.warning("Skipping lastMessage update due to invalid room id | user=%s room=%s detail=%s", uid, room_id, exc.detail)

                # Broadcast to other members (exclude sender to avoid duplicate)
                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "new_message", "message": msg_doc},
                    exclude=uid,
                )

                # Send ACK back to sender so the client can replace the optimistic message
                await manager.send_to_user(uid, {
                    "type": "message_ack",
                    "localId": local_id,
                    "message": msg_doc,
                })

            elif event_type == "typing":
                room_id = data.get("roomId", "")
                if not room_id:
                    continue
                try:
                    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                except HTTPException:
                    continue
                if not room:
                    continue
                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "typing", "roomId": room_id, "userId": uid, "username": user.get("username", "")},
                    exclude=uid,
                )

            elif event_type == "read_receipt":
                room_id = data.get("roomId", "")
                if room_id:
                    await db.chat_messages.update_many(
                        {"roomId": room_id, "readBy": {"$ne": uid}},
                        {"$addToSet": {"readBy": uid}},
                    )
                    try:
                        room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                    except HTTPException:
                        room = None
                    if room:
                        await manager.broadcast_to_room(
                            room.get("members", []),
                            {"type": "read_receipt", "roomId": room_id, "userId": uid},
                            exclude=uid,
                        )

    except WebSocketDisconnect:
        logger.info("WS disconnected: user=%s", uid)
    except Exception:
        logger.exception("WS error: user=%s", uid)
    finally:
        manager.disconnect(uid)
