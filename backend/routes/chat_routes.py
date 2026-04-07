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
)

# Allowed file types for chat uploads
ALLOWED_EXTENSIONS = {
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls',
    'md', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'
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
    contacts = []
    async for doc in cursor:
        other_id = doc["contactId"] if doc["userId"] == uid else doc["userId"]
        other_user = await db.users.find_one({"_id": ObjectId(other_id)})
        if other_user:
            contacts.append({
                "id": other_id,
                "username": other_user.get("username", ""),
                "email": other_user.get("email", ""),
                "role": other_user.get("role", "student"),
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
    requests = []
    async for doc in cursor:
        sender = await db.users.find_one({"_id": ObjectId(doc["userId"])})
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
    cursor = db.users.find(
        {"username": {"$regex": q, "$options": "i"}},
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
    """Find or create a direct message room between two users."""
    uid = str(user["id"])
    target_id = body.targetUserId
    if target_id == uid:
        raise HTTPException(status_code=400, detail="Cannot create DM with yourself")

    # Check existing direct room
    existing = await db.chat_rooms.find_one({
        "type": "direct",
        "members": {"$all": [uid, target_id], "$size": 2},
    })
    if existing:
        return {"ok": True, "roomId": str(existing["_id"])}

    now = _utcnow()
    result = await db.chat_rooms.insert_one({
        "type": "direct",
        "name": None,
        "members": [uid, target_id],
        "createdBy": uid,
        "avatarColor": None,
        "createdAt": now,
        "lastMessage": None,
    })
    return {"ok": True, "roomId": str(result.inserted_id)}


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
    svc = AIGatewayService()
    prompt = f"Translate the following text to {lang_name}. Return ONLY the translation, no explanation:\n\n{text}"
    result = await svc.chat(prompt)
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

    # Save to static/chat_files/{room_id}/
    room_dir = os.path.join(CHAT_FILES_DIR, room_id)
    os.makedirs(room_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(room_dir, safe_name)
    with open(file_path, "wb") as f_out:
        f_out.write(data)

    file_url = f"/static/chat_files/{room_id}/{safe_name}"
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

    # Fetch course — allow teacher or admin
    course = await db.courses.find_one({"_id": safe_object_id(body.courseId, label="course")})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if user.get("role") not in ("teacher", "admin") and str(course.get("teacherId", "")) != uid:
        raise HTTPException(status_code=403, detail="Only the course teacher can create a course group")

    course_name = course.get("name") or course.get("title") or "Course"

    # Return existing if already created
    existing = await db.chat_rooms.find_one({"courseId": body.courseId, "type": "group"})
    if existing:
        return {"ok": True, "roomId": str(existing["_id"]), "isExisting": True}

    # Collect enrolled student IDs
    student_ids: list[str] = []
    async for enroll in db.enrollments.find({"courseId": body.courseId}, {"userId": 1}):
        student_ids.append(str(enroll["userId"]))

    member_ids = list(set([uid] + student_ids))
    now = _utcnow()
    result = await db.chat_rooms.insert_one({
        "type": "group",
        "name": f"{course_name} 群聊",
        "members": member_ids,
        "createdBy": uid,
        "courseId": body.courseId,
        "avatarColor": _hash_color(course_name),
        "createdAt": now,
        "lastMessage": None,
    })
    room_id = str(result.inserted_id)

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

    if role in ("teacher", "admin"):
        async for c in db.courses.find({"teacherId": uid}, {"_id": 1, "name": 1, "title": 1}):
            c_id = str(c["_id"])
            existing = await db.chat_rooms.find_one({"courseId": c_id, "type": "group"})
            courses.append({
                "id": c_id,
                "name": c.get("name") or c.get("title") or "Untitled",
                "existingRoomId": str(existing["_id"]) if existing else None,
            })
    return {"courses": courses}


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
            except Exception:
                pass
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
                except HTTPException:
                    pass

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
