from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from pymongo import ReturnDocument

from backend.core.database import db
from backend.repositories import chat_room_repo, user_repo
from backend.repositories._helpers import coerce_object_id, require_object_id

from .query_service import get_room_for_member, get_user_map, hash_color, serialize_doc, utcnow_iso


def _http_object_id(value: str, *, detail: str):
    try:
        return require_object_id(value, detail=detail)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _find_existing_group_rooms_by_course_ids(course_ids: list[str]) -> dict[str, str]:
    normalized_ids = [str(course_id).strip() for course_id in course_ids if str(course_id).strip()]
    if not normalized_ids:
        return {}

    room_by_course_id: dict[str, str] = {}
    for room in await chat_room_repo.find_group_rooms_by_course_ids(
        normalized_ids,
        projection={"_id": 1, "courseId": 1},
    ):
        course_id = str(room.get("courseId", "")).strip()
        if course_id:
            room_by_course_id[course_id] = str(room["_id"])
    return room_by_course_id


async def list_rooms_for_user(user_id: str) -> list[dict[str, Any]]:
    rooms: list[dict[str, Any]] = []
    other_user_ids: set[str] = set()

    for doc in await chat_room_repo.list_rooms_for_member(user_id):
        room = serialize_doc(doc) or {}
        if room.get("type") == "direct" and not room.get("name"):
            other_id = next((member_id for member_id in room.get("members", []) if member_id != user_id), None)
            if other_id:
                other_user_ids.add(other_id)
        rooms.append(room)

    user_name_map = {
        key: value.get("username", "Unknown")
        for key, value in (await get_user_map(sorted(other_user_ids))).items()
    }

    room_ids = [room["id"] for room in rooms]
    unread_map: dict[str, int] = {}
    if room_ids:
        pipeline = [
            {"$match": {"roomId": {"$in": room_ids}, "readBy": {"$ne": user_id}, "senderId": {"$ne": user_id}}},
            {"$group": {"_id": "$roomId", "count": {"$sum": 1}}},
        ]
        async for doc in db.chat_messages.aggregate(pipeline):
            unread_map[str(doc["_id"])] = int(doc.get("count", 0))

    for room in rooms:
        if room.get("type") == "direct" and not room.get("name"):
            other_id = next((member_id for member_id in room.get("members", []) if member_id != user_id), None)
            if other_id:
                room["name"] = user_name_map.get(other_id, "Unknown")
        room["unreadCount"] = unread_map.get(room["id"], 0)

    return rooms


async def create_group_room(
    *,
    room_name: str,
    member_ids: list[str],
    actor_id: str,
    actor_name: str,
) -> str:
    normalized_members = sorted(set([actor_id, *member_ids]))
    if len(normalized_members) < 3:
        raise HTTPException(status_code=400, detail="Group chat requires at least 3 members (you + 2)")

    other_ids = [member_id for member_id in normalized_members if member_id != actor_id]
    if other_ids:
        valid_oids = []
        for member_id in other_ids:
            try:
                valid_oids.append(require_object_id(member_id, detail=f"Invalid member ID: {member_id}"))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        found_users = await user_repo.find_many_by_ids(valid_oids, projection={"_id": 1})
        if len(found_users) != len(valid_oids):
            raise HTTPException(status_code=400, detail="One or more member IDs do not exist")

    now = utcnow_iso()
    name = room_name.strip()
    result = await db.chat_rooms.insert_one(
        {
            "type": "group",
            "name": name,
            "members": normalized_members,
            "createdBy": actor_id,
            "avatarColor": hash_color(name),
            "createdAt": now,
            "lastMessage": None,
        }
    )

    room_id = str(result.inserted_id)
    await db.chat_messages.insert_one(
        {
            "roomId": room_id,
            "senderId": actor_id,
            "senderName": actor_name,
            "content": f'{actor_name} created the group "{name}"',
            "type": "system",
            "readBy": [actor_id],
            "sentAt": now,
        }
    )
    return room_id


async def create_or_get_direct_room(*, actor_id: str, target_user_id: str) -> str:
    if target_user_id == actor_id:
        raise HTTPException(status_code=400, detail="Cannot create DM with yourself")

    pair_key = "|".join(sorted([actor_id, target_user_id]))
    now = utcnow_iso()
    doc = await db.chat_rooms.find_one_and_update(
        {"directPairKey": pair_key, "type": "direct"},
        {
            "$setOnInsert": {
                "type": "direct",
                "name": None,
                "members": sorted([actor_id, target_user_id]),
                "directPairKey": pair_key,
                "createdBy": actor_id,
                "avatarColor": None,
                "createdAt": now,
                "lastMessage": None,
            }
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return str(doc["_id"])


async def create_course_group_room(*, course_id: str, user: dict[str, Any]) -> dict[str, Any]:
    user_id = str(user["id"])
    role = user.get("role", "student")

    section = None
    course_oid = coerce_object_id(course_id)
    if course_oid is not None:
        section = await db.course_sections.find_one({"_id": course_oid})

    legacy_course = None
    if not section:
        if course_oid is not None:
            legacy_course = await db.courses.find_one({"_id": course_oid})
        if not legacy_course:
            legacy_course = await db.courses.find_one({"courseId": course_id})

    if not section and not legacy_course:
        raise HTTPException(status_code=404, detail="Course not found")

    if section:
        course_identity = str(section["_id"])
        course_name = section.get("courseName") or section.get("courseCode") or "Course"
        owner_teacher_id = str(section.get("ownerTeacherId", "")).strip()
        enrollment = await db.enrollments.find_one({"courseSectionId": course_identity, "userId": user_id})
        if role != "admin" and user_id != owner_teacher_id and not enrollment:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")

        member_ids: set[str] = set()
        async for enroll in db.enrollments.find({"courseSectionId": course_identity}, {"userId": 1}):
            enrolled_user_id = str(enroll.get("userId", "")).strip()
            if enrolled_user_id:
                member_ids.add(enrolled_user_id)
        if owner_teacher_id:
            member_ids.add(owner_teacher_id)
    else:
        course_identity = str(legacy_course["_id"]) if "_id" in legacy_course else course_id
        course_name = legacy_course.get("name") or legacy_course.get("title") or legacy_course.get("courseId") or "Course"
        teacher_id = str(legacy_course.get("teacherId", "")).strip()
        if role != "admin" and user_id != teacher_id:
            raise HTTPException(status_code=403, detail="Only course members can create this group")

        member_ids = {teacher_id} if teacher_id else set()
        async for enroll in db.enrollments.find({"courseId": course_id}, {"userId": 1}):
            enrolled_user_id = str(enroll.get("userId", "")).strip()
            if enrolled_user_id:
                member_ids.add(enrolled_user_id)

    member_ids.add(user_id)
    now = utcnow_iso()
    doc = await db.chat_rooms.find_one_and_update(
        {"courseId": course_identity, "type": "group"},
        {
            "$setOnInsert": {
                "type": "group",
                "name": f"{course_name} \u7fa4\u804a",
                "members": sorted(member_ids),
                "createdBy": user_id,
                "courseId": course_identity,
                "avatarColor": hash_color(course_name),
                "createdAt": now,
                "lastMessage": None,
            }
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    room_id = str(doc["_id"])
    if doc.get("createdAt") != now:
        return {"roomId": room_id, "isExisting": True}

    await db.chat_messages.insert_one(
        {
            "roomId": room_id,
            "senderId": user_id,
            "senderName": user.get("username", ""),
            "content": f'Group chat created for course "{course_name}"',
            "type": "system",
            "messageType": "text",
            "recalled": False,
            "readBy": [user_id],
            "sentAt": now,
        }
    )

    new_room = await chat_room_repo.find_by_id(_http_object_id(room_id, detail=f"Invalid room: {room_id!r}"))
    return {
        "roomId": room_id,
        "isExisting": False,
        "room": serialize_doc(new_room),
        "memberIds": sorted(member_ids),
    }


async def list_courses_for_group(user: dict[str, Any]) -> list[dict[str, Any]]:
    user_id = str(user["id"])
    role = user.get("role", "student")
    courses: list[dict[str, Any]] = []
    section_ids: set[str] = set()

    if role == "admin":
        async for section in db.course_sections.find({}, {"_id": 1}):
            section_ids.add(str(section["_id"]))
    else:
        async for enroll in db.enrollments.find({"userId": user_id}, {"courseSectionId": 1}):
            section_id = str(enroll.get("courseSectionId", "")).strip()
            if section_id:
                section_ids.add(section_id)

        if role in ("teacher", "ta"):
            async for section in db.course_sections.find({"ownerTeacherId": user_id}, {"_id": 1}):
                section_ids.add(str(section["_id"]))

    if section_ids:
        oid_ids = [section_oid for section_id in section_ids if (section_oid := coerce_object_id(section_id)) is not None]
        course_docs = [
            course
            async for course in db.course_sections.find(
                {"_id": {"$in": oid_ids}},
                {"_id": 1, "courseCode": 1, "courseName": 1},
            )
        ]
        existing_rooms = await _find_existing_group_rooms_by_course_ids(
            [str(course["_id"]) for course in course_docs]
        )
        for course in course_docs:
            course_identity = str(course["_id"])
            courses.append(
                {
                    "id": course_identity,
                    "name": course.get("courseName") or course.get("courseCode") or "Untitled",
                    "existingRoomId": existing_rooms.get(course_identity),
                }
            )

    if not courses and role in ("teacher", "admin"):
        query = {} if role == "admin" else {"teacherId": user_id}
        legacy_docs = [
            course
            async for course in db.courses.find(
                query,
                {"_id": 1, "name": 1, "title": 1},
            )
        ]
        existing_rooms = await _find_existing_group_rooms_by_course_ids(
            [str(course["_id"]) for course in legacy_docs]
        )
        for course in legacy_docs:
            course_identity = str(course["_id"])
            courses.append(
                {
                    "id": course_identity,
                    "name": course.get("name") or course.get("title") or "Untitled",
                    "existingRoomId": existing_rooms.get(course_identity),
                }
            )

    return courses


async def get_room_info(*, room_id: str, user_id: str) -> dict[str, Any]:
    room = await get_room_for_member(room_id, user_id)
    room_data = serialize_doc(room) or {}
    user_map = await get_user_map(list(room.get("members", [])))
    members = [user_map[member_id] for member_id in room.get("members", []) if member_id in user_map]
    return {"room": room_data, "members": members, "isOwner": room_data.get("createdBy") == user_id}


async def add_room_member(
    *,
    room_id: str,
    new_member_id: str,
    actor_id: str,
    actor_name: str,
) -> dict[str, Any]:
    room = await get_room_for_member(room_id, actor_id)
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Can only add members to group rooms")
    if room.get("createdBy") != actor_id:
        raise HTTPException(status_code=403, detail="Only the group owner can add members")
    if not new_member_id:
        raise HTTPException(status_code=400, detail="userId is required")

    target = await db.users.find_one({"_id": _http_object_id(new_member_id, detail=f"Invalid user: {new_member_id!r}")})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if new_member_id in room.get("members", []):
        raise HTTPException(status_code=400, detail="User is already a member")

    now = utcnow_iso()
    await db.chat_rooms.update_one({"_id": room["_id"]}, {"$addToSet": {"members": new_member_id}})
    await db.chat_messages.insert_one(
        {
            "roomId": room_id,
            "senderId": actor_id,
            "senderName": actor_name,
            "content": f"{target.get('username', '')} was added to the group",
            "type": "system",
            "messageType": "text",
            "recalled": False,
            "readBy": [actor_id],
            "deletedFor": [],
            "sentAt": now,
        }
    )

    updated_room = await db.chat_rooms.find_one({"_id": room["_id"]})
    return {"room": serialize_doc(updated_room)}


async def kick_room_member(
    *,
    room_id: str,
    target_id: str,
    actor_id: str,
    actor_name: str,
) -> dict[str, Any]:
    room = await get_room_for_member(room_id, actor_id)
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Can only kick members from group rooms")
    if room.get("createdBy") != actor_id:
        raise HTTPException(status_code=403, detail="Only the group owner can kick members")
    if not target_id:
        raise HTTPException(status_code=400, detail="userId is required")
    if target_id == actor_id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself; use leave instead")
    if target_id not in room.get("members", []):
        raise HTTPException(status_code=400, detail="User is not a member")

    target = await db.users.find_one({"_id": _http_object_id(target_id, detail=f"Invalid user: {target_id!r}")})
    target_name = target.get("username", "Unknown") if target else "Unknown"

    now = utcnow_iso()
    await db.chat_rooms.update_one({"_id": room["_id"]}, {"$pull": {"members": target_id}})
    await db.chat_messages.insert_one(
        {
            "roomId": room_id,
            "senderId": actor_id,
            "senderName": actor_name,
            "content": f"{target_name} was removed from the group",
            "type": "system",
            "messageType": "text",
            "recalled": False,
            "readBy": [actor_id],
            "deletedFor": [],
            "sentAt": now,
        }
    )

    return {"roomMembers": list(room.get("members", [])), "targetId": target_id}


async def leave_room(*, room_id: str, actor_id: str, actor_name: str) -> dict[str, Any]:
    room = await get_room_for_member(room_id, actor_id)
    if room.get("type") != "group":
        raise HTTPException(status_code=400, detail="Cannot leave a direct room; use delete chat instead")
    if room.get("createdBy") == actor_id:
        raise HTTPException(status_code=400, detail="Group owner cannot leave. Transfer ownership or delete the group.")

    now = utcnow_iso()
    await db.chat_rooms.update_one({"_id": room["_id"]}, {"$pull": {"members": actor_id}})
    await db.chat_messages.insert_one(
        {
            "roomId": room_id,
            "senderId": actor_id,
            "senderName": actor_name,
            "content": f"{actor_name} left the group",
            "type": "system",
            "messageType": "text",
            "recalled": False,
            "readBy": [actor_id],
            "deletedFor": [],
            "sentAt": now,
        }
    )

    updated_room = await db.chat_rooms.find_one({"_id": room["_id"]})
    return {"room": serialize_doc(updated_room)}


async def delete_room(*, room_id: str, actor_id: str) -> dict[str, Any]:
    room = await get_room_for_member(room_id, actor_id)

    if room.get("type") == "direct":
        await db.chat_rooms.update_one({"_id": room["_id"]}, {"$pull": {"members": actor_id}})
        return {"broadcastMembers": []}

    if room.get("createdBy") != actor_id:
        raise HTTPException(status_code=403, detail="Only the group owner can delete the group")

    await db.chat_rooms.delete_one({"_id": room["_id"]})
    await db.chat_messages.delete_many({"roomId": room_id})
    return {"broadcastMembers": list(room.get("members", []))}
