from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.core.utils import safe_object_id


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc and "_id" in doc:
        payload = dict(doc)
        payload["id"] = str(payload["_id"])
        del payload["_id"]
        return payload
    return doc


def hash_color(name: str) -> str:
    return f"hsl({hash(name) % 360}, 60%, 45%)"


async def get_chat_user_by_id(user_id: str) -> dict[str, Any] | None:
    if not ObjectId.is_valid(str(user_id or "")):
        return None

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return None

    user["id"] = str(user["_id"])
    return user


async def get_room_for_member(
    room_id: str,
    user_id: str,
    *,
    projection: dict[str, Any] | None = None,
    raise_not_found: bool = True,
) -> dict[str, Any] | None:
    room = await db.chat_rooms.find_one(
        {"_id": safe_object_id(room_id, label="room"), "members": user_id},
        projection,
    )
    if not room and raise_not_found:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


async def get_room_by_id(
    room_id: str,
    *,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room")}, projection)


async def get_message_by_id(
    message_id: str,
    *,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.chat_messages.find_one({"_id": safe_object_id(message_id, label="message")}, projection)


async def get_user_map(user_ids: list[str]) -> dict[str, dict[str, Any]]:
    valid_oids = [ObjectId(user_id) for user_id in user_ids if ObjectId.is_valid(user_id)]
    if not valid_oids:
        return {}

    user_map: dict[str, dict[str, Any]] = {}
    async for user in db.users.find(
        {"_id": {"$in": valid_oids}},
        {"_id": 1, "username": 1, "email": 1, "role": 1},
    ):
        user_id = str(user["_id"])
        user_map[user_id] = {
            "id": user_id,
            "username": user.get("username", ""),
            "email": user.get("email", ""),
            "role": user.get("role", "student"),
        }
    return user_map

