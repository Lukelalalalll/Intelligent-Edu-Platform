from __future__ import annotations

from typing import Any

from bson import ObjectId

from backend.core.database import db
from backend.repositories._helpers import coerce_object_id


def room_oid(room_id: str | ObjectId) -> ObjectId | None:
    return coerce_object_id(room_id)


async def find_by_id(
    room_id: str | ObjectId,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    oid = room_oid(room_id)
    if oid is None:
        return None
    query = {"_id": oid}
    if projection is None:
        return await db.chat_rooms.find_one(query)
    return await db.chat_rooms.find_one(query, projection)


async def find_for_member(
    room_id: str | ObjectId,
    user_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    oid = room_oid(room_id)
    if oid is None:
        return None
    query = {"_id": oid, "members": user_id}
    if projection is None:
        return await db.chat_rooms.find_one(query)
    return await db.chat_rooms.find_one(query, projection)


async def list_rooms_for_member(
    user_id: str,
    *,
    projection: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    cursor = db.chat_rooms.find({"members": user_id}, projection).sort("createdAt", -1)
    return [doc async for doc in cursor]


async def find_group_rooms_by_course_ids(
    course_ids: list[str],
    *,
    projection: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    normalized_ids = [str(course_id).strip() for course_id in course_ids if str(course_id).strip()]
    if not normalized_ids:
        return []
    cursor = db.chat_rooms.find(
        {"courseId": {"$in": normalized_ids}, "type": "group"},
        projection,
    )
    return [doc async for doc in cursor]


async def list_group_rooms_page(
    *,
    skip: int,
    limit: int,
    projection: dict[str, Any] | None = None,
) -> tuple[int, list[dict[str, Any]]]:
    query = {"type": "group"}
    total = await db.chat_rooms.count_documents(query)
    cursor = (
        db.chat_rooms.find(query, projection)
        .sort([("createdAt", -1), ("name", 1)])
        .skip(skip)
        .limit(limit)
    )
    return total, [doc async for doc in cursor]
