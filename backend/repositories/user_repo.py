from __future__ import annotations

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from backend.core.database import db


def _user_oid(user_id: str | ObjectId) -> ObjectId | None:
    if isinstance(user_id, ObjectId):
        return user_id
    try:
        return ObjectId(str(user_id))
    except (InvalidId, TypeError, ValueError):
        return None


async def find_by_username(username: str, projection: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return await db.users.find_one({"username": username}, projection)


async def find_by_username_normalized(
    username_normalized: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.users.find_one({"username_normalized": username_normalized}, projection)


async def find_by_email(email: str, projection: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return await db.users.find_one({"email": email}, projection)


async def find_by_email_normalized(
    email_normalized: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.users.find_one({"email_normalized": email_normalized}, projection)


async def find_by_google_sub(
    google_sub: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.users.find_one({"google_auth.sub": google_sub}, projection)


async def find_by_id(user_id: str | ObjectId, projection: dict[str, Any] | None = None) -> dict[str, Any] | None:
    oid = _user_oid(user_id)
    if oid is None:
        return None
    return await db.users.find_one({"_id": oid}, projection)


async def find_many_by_ids(
    user_ids: list[str | ObjectId],
    *,
    projection: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    oids = [_user_oid(user_id) for user_id in user_ids]
    oids = [oid for oid in oids if oid is not None]
    if not oids:
        return []
    return await db.users.find({"_id": {"$in": oids}}, projection).to_list(length=len(oids))


async def list_users(
    *,
    filt: dict[str, Any] | None = None,
    projection: dict[str, Any] | None = None,
    skip: int = 0,
    limit: int = 0,
    sort: list[tuple[str, int]] | None = None,
) -> list[dict[str, Any]]:
    cursor = db.users.find(filt or {}, projection)
    if sort:
        cursor = cursor.sort(sort)
    if skip:
        cursor = cursor.skip(skip)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(length=limit or 0)


async def count_users(filt: dict[str, Any] | None = None) -> int:
    return await db.users.count_documents(filt or {})


async def insert_user(document: dict[str, Any]):
    return await db.users.insert_one(document)


async def update_by_id(user_id: str | ObjectId, update: dict[str, Any]):
    oid = _user_oid(user_id)
    if oid is None:
        return None
    return await db.users.update_one({"_id": oid}, update)


async def delete_by_id(user_id: str | ObjectId):
    oid = _user_oid(user_id)
    if oid is None:
        return None
    return await db.users.delete_one({"_id": oid})


async def add_teacher_course(user_id: str | ObjectId, course_id: str):
    oid = _user_oid(user_id)
    if oid is None:
        return None
    return await db.users.update_one({"_id": oid}, {"$addToSet": {"teacherCourseIds": course_id}})


async def remove_teacher_course(user_id: str | ObjectId, course_id: str):
    oid = _user_oid(user_id)
    if oid is None:
        return None
    return await db.users.update_one({"_id": oid}, {"$pull": {"teacherCourseIds": course_id}})


async def remove_teacher_course_from_all(course_id: str):
    return await db.users.update_many({}, {"$pull": {"teacherCourseIds": course_id}})


async def get_ai_memory(user_id: str | ObjectId) -> dict[str, Any]:
    doc = await find_by_id(user_id, {"ai_memory": 1})
    return dict((doc or {}).get("ai_memory", {}) or {})


async def set_ai_memory(user_id: str | ObjectId, memory: dict[str, Any]):
    return await update_by_id(user_id, {"$set": {"ai_memory": memory}})
