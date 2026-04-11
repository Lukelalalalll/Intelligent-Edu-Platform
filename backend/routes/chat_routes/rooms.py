"""Chat room CRUD, course groups, and group management."""

import logging

from bson import ObjectId
from fastapi import Depends, HTTPException

from backend.core.database import db
from backend.core.security import get_current_user
from backend.core.utils import safe_object_id
from backend.schemas import (
    ChatCreateRoomSchema,
    ChatCreateDirectRoomSchema,
    ChatCreateCourseGroupSchema,
)

from .router import chat_router, _utcnow, _str_id, _hash_color, manager

logger = logging.getLogger(__name__)


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

    user_name_map: dict[str, str] = {}
    if other_user_ids:
        oids = [ObjectId(uid_) for uid_ in other_user_ids]
        async for u in db.users.find({"_id": {"$in": oids}}, {"_id": 1, "username": 1}):
            user_name_map[str(u["_id"])] = u.get("username", "Unknown")

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
        if room.get("type") == "direct" and not room.get("name"):
            members = room.get("members", [])
            other_id = next((m for m in members if m != uid), None)
            if other_id:
                room["name"] = user_name_map.get(other_id, "Unknown")
        room["unreadCount"] = unread_map.get(room["id"], 0)

    return {"rooms": rooms}


@chat_router.post("/rooms")
async def create_group_room(body: ChatCreateRoomSchema, user: dict = Depends(get_current_user)):
    """Create a group chat room."""
    uid = str(user["id"])
    member_ids = list(set([uid] + body.memberIds))
    if len(member_ids) < 3:
        raise HTTPException(status_code=400, detail="Group chat requires at least 3 members (you + 2)")

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

    pair_key = "|".join(sorted([uid, target_id]))
    now = _utcnow()

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


@chat_router.post("/rooms/from-course")
async def create_room_from_course(
    body: ChatCreateCourseGroupSchema,
    user: dict = Depends(get_current_user),
):
    """Create (or return existing) a group chat room for a course."""
    uid = str(user["id"])
    role = user.get("role", "student")

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
        async for enroll in db.enrollments.find({"courseId": body.courseId}, {"userId": 1}):
            user_id = str(enroll.get("userId", "")).strip()
            if user_id:
                member_ids_set.add(user_id)

    member_ids_set.add(uid)
    member_ids = sorted(member_ids_set)
    now = _utcnow()

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
        async for enroll in db.enrollments.find({"userId": uid}, {"courseSectionId": 1}):
            sid = str(enroll.get("courseSectionId", "")).strip()
            if sid:
                section_ids.add(sid)

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


# ── Group Management ──

@chat_router.get("/rooms/{room_id}/info")
async def get_room_info(room_id: str, user: dict = Depends(get_current_user)):
    """Get detailed room info including member profiles."""
    uid = str(user["id"])
    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    room_data = _str_id(room)

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
        await db.chat_rooms.update_one(
            {"_id": safe_object_id(room_id, label="room")},
            {"$pull": {"members": uid}},
        )
    elif room.get("createdBy") == uid:
        await db.chat_rooms.delete_one({"_id": safe_object_id(room_id, label="room")})
        await db.chat_messages.delete_many({"roomId": room_id})
        await manager.broadcast_to_room(
            room.get("members", []),
            {"type": "room_deleted", "roomId": room_id},
            exclude=uid,
        )
    else:
        raise HTTPException(status_code=403, detail="Only the group owner can delete the group")

    return {"ok": True}
