from __future__ import annotations

from typing import Any

from bson import ObjectId

from backend.core.database import db
from backend.repositories._helpers import coerce_object_id


def message_oid(message_id: str | ObjectId) -> ObjectId | None:
    return coerce_object_id(message_id)


async def find_by_id(
    message_id: str | ObjectId,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    oid = message_oid(message_id)
    if oid is None:
        return None
    return await db.chat_messages.find_one({"_id": oid}, projection)


async def list_room_messages(
    *,
    room_id: str,
    before: str | None = None,
    since: str | None = None,
    exclude_deleted_for: str = "",
    projection: dict[str, Any] | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"roomId": room_id}
    sent_at_filter: dict[str, Any] = {}
    if before:
        sent_at_filter["$lt"] = before
    if since:
        sent_at_filter["$gt"] = since
    if sent_at_filter:
        query["sentAt"] = sent_at_filter
    if exclude_deleted_for:
        query["deletedFor"] = {"$ne": exclude_deleted_for}

    safe_limit = max(1, int(limit or 1))
    cursor = db.chat_messages.find(query, projection).sort("sentAt", -1).limit(safe_limit)
    return [doc async for doc in cursor]


async def list_by_ids(
    message_ids: list[str | ObjectId],
    *,
    projection: dict[str, Any] | None = None,
    sort: list[tuple[str, int]] | None = None,
) -> list[dict[str, Any]]:
    oids = [message_oid(message_id) for message_id in message_ids]
    oids = [oid for oid in oids if oid is not None]
    if not oids:
        return []

    cursor = db.chat_messages.find({"_id": {"$in": oids}}, projection)
    if sort:
        cursor = cursor.sort(sort)
    return await cursor.to_list(length=len(oids))
