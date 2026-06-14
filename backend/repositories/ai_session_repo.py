from __future__ import annotations

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from backend.core.database import db


def session_oid(session_id: str | ObjectId) -> ObjectId | None:
    if isinstance(session_id, ObjectId):
        return session_id
    try:
        return ObjectId(str(session_id))
    except (InvalidId, TypeError, ValueError):
        return None


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


async def list_for_user(user_id: str | ObjectId, *, projection: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    user_oid = session_oid(user_id)
    if user_oid is None:
        return []
    cursor = db.ai_chat_sessions.find({"userId": user_oid}, projection).sort("updatedAt", -1)
    return await cursor.to_list(length=None)


async def insert_session(document: dict[str, Any]):
    return await db.ai_chat_sessions.insert_one(document)


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
