from __future__ import annotations

from typing import Any

from bson import ObjectId

from backend.core.database import db
from ._helpers import build_page_result, coerce_object_id, normalize_pagination


def session_oid(session_id: str | ObjectId) -> ObjectId | None:
    return coerce_object_id(session_id)


async def find_by_id(session_id: str | ObjectId) -> dict[str, Any] | None:
    oid = session_oid(session_id)
    if oid is None:
        return None
    return await db.ai_chat_sessions.find_one({"_id": oid})


async def find_by_id_for_user(session_id: str | ObjectId, user_id: str | ObjectId) -> dict[str, Any] | None:
    oid = session_oid(session_id)
    user_oid = session_oid(user_id)
    if oid is None or user_oid is None:
        return None
    return await db.ai_chat_sessions.find_one({"_id": oid, "userId": user_oid})


def find_cursor_for_user(
    user_id: str | ObjectId,
    *,
    projection: dict[str, Any] | None = None,
):
    user_oid = session_oid(user_id)
    if user_oid is None:
        return None
    return db.ai_chat_sessions.find({"userId": user_oid}, projection)


async def count_sessions_by_user_ids(user_ids: list[str | ObjectId]) -> dict[str, int]:
    oids = [session_oid(user_id) for user_id in user_ids]
    oids = [oid for oid in oids if oid is not None]
    if not oids:
        return {}

    pipeline = [
        {"$match": {"userId": {"$in": oids}}},
        {"$group": {"_id": "$userId", "count": {"$sum": 1}}},
    ]
    counts: dict[str, int] = {}
    async for item in db.ai_chat_sessions.aggregate(pipeline):
        counts[str(item["_id"])] = int(item.get("count", 0))
    return counts


async def list_for_user(
    user_id: str | ObjectId,
    *,
    projection: dict[str, Any] | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    user_oid = session_oid(user_id)
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    if user_oid is None:
        return build_page_result(items=[], total=0, page=safe_page, page_size=safe_page_size)
    query = {"userId": user_oid}
    skip = (safe_page - 1) * safe_page_size
    total = await db.ai_chat_sessions.count_documents(query)
    docs = await (
        db.ai_chat_sessions.find(query, projection)
        .sort("updatedAt", -1)
        .skip(skip)
        .limit(safe_page_size)
        .to_list(length=safe_page_size)
    )
    return build_page_result(items=docs, total=total, page=safe_page, page_size=safe_page_size)


async def insert_session(document: dict[str, Any]):
    return await db.ai_chat_sessions.insert_one(document)


async def update_by_id(
    session_id: str | ObjectId,
    update: dict[str, Any],
):
    oid = session_oid(session_id)
    if oid is None:
        return None
    return await db.ai_chat_sessions.update_one({"_id": oid}, update)


async def update_with_revision(
    *,
    session_id: str | ObjectId,
    current_revision: int,
    update_fields: dict[str, Any],
):
    oid = session_oid(session_id)
    if oid is None:
        return None
    revision_filter: dict[str, Any] = {"_id": oid, "revision": current_revision}
    if current_revision == 0:
        revision_filter = {
            "_id": oid,
            "$or": [
                {"revision": 0},
                {"revision": {"$exists": False}},
            ],
        }
    return await db.ai_chat_sessions.update_one(
        revision_filter,
        {"$set": update_fields},
    )


async def delete_session(session_id: str | ObjectId):
    oid = session_oid(session_id)
    if oid is None:
        return None
    return await db.ai_chat_sessions.delete_one({"_id": oid})
