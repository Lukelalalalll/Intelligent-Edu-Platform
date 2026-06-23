from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from bson.objectid import ObjectId
from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.services.files.file_asset_service import ensure_ai_session_image_assets


def _serialize_mongo_value(value: Any):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_serialize_mongo_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_mongo_value(item) for key, item in value.items()}
    return value


def _date_bucket(value: Any, group_by: str) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m" if group_by == "month" else "%Y-%m-%d")
    if isinstance(value, str) and value:
        return value[:7] if group_by == "month" else value[:10]
    return "unknown"


async def list_chat_rooms(*, skip: int, limit: int) -> dict[str, Any]:
    pipeline = [
        {"$match": {"type": "group"}},
        {
            "$lookup": {
                "from": "file_assets",
                "let": {"rid": {"$toString": "$_id"}},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$room_id", "$$rid"]},
                                    {"$eq": ["$scope", "chat_group"]},
                                    {"$ne": ["$status", "hard_deleted"]},
                                ]
                            }
                        }
                    }
                ],
                "as": "assets",
            }
        },
        {
            "$project": {
                "_id": 0,
                "room_id": {"$toString": "$_id"},
                "name": "$name",
                "type": "$type",
                "course_id": "$courseId",
                "member_count": {"$size": {"$ifNull": ["$members", []]}},
                "asset_count": {"$size": "$assets"},
                "created_at": "$createdAt",
            }
        },
        {"$sort": {"asset_count": -1, "name": 1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    rooms = [_serialize_mongo_value(doc) async for doc in db.chat_rooms.aggregate(pipeline)]
    total = await db.chat_rooms.count_documents({"type": "group"})
    return {"rooms": rooms, "total": total, "skip": skip, "limit": limit}


async def list_chat_room_assets(*, room_id: str, status: str) -> dict[str, Any]:
    query: dict[str, Any] = {"room_id": room_id, "scope": "chat_group"}
    query["status"] = status if status else {"$ne": "hard_deleted"}

    room = None
    if ObjectId.is_valid(room_id):
        room = await db.chat_rooms.find_one({"_id": ObjectId(room_id)}, {"name": 1, "courseId": 1, "type": 1})

    assets = []
    async for doc in db.file_assets.find(query).sort("created_at", -1):
        item = _serialize_mongo_value(doc)
        storage_path = str(item.get("storage_path", "") or "").lstrip("/")
        item["exists_on_disk"] = os.path.exists(os.path.join(Config.BASE_DIR, storage_path))
        assets.append(item)

    return {
        "room": _serialize_mongo_value(room) if room else {"id": room_id},
        "assets": assets,
        "total": len(assets),
    }


async def list_ai_users(*, role: str, skip: int, limit: int) -> dict[str, Any]:
    users = await (
        db.users.find({"role": role}, {"username": 1, "email": 1, "role": 1})
        .sort("username", 1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )
    total = await db.users.count_documents({"role": role})

    user_ids = [str(user.get("_id")) for user in users]
    for user_id in user_ids:
        await ensure_ai_session_image_assets(user_id)

    object_ids = [ObjectId(user_id) for user_id in user_ids if ObjectId.is_valid(user_id)]
    session_counts: dict[str, int] = {}
    if object_ids:
        pipeline = [
            {"$match": {"userId": {"$in": object_ids}}},
            {"$group": {"_id": "$userId", "count": {"$sum": 1}}},
        ]
        async for doc in db.ai_chat_sessions.aggregate(pipeline):
            session_counts[str(doc["_id"])] = int(doc.get("count", 0))

    asset_counts: dict[str, int] = {}
    if user_ids:
        pipeline = [
            {"$match": {"scope": "ai_personal", "user_id": {"$in": user_ids}, "status": {"$ne": "hard_deleted"}}},
            {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
        ]
        async for doc in db.file_assets.aggregate(pipeline):
            asset_counts[str(doc["_id"])] = int(doc.get("count", 0))

    items = [
        {
            "user_id": str(user.get("_id")),
            "username": user.get("username", ""),
            "email": user.get("email", ""),
            "role": user.get("role", role),
            "session_count": session_counts.get(str(user.get("_id")), 0),
            "asset_count": asset_counts.get(str(user.get("_id")), 0),
        }
        for user in users
    ]
    return {"users": items, "total": total, "skip": skip, "limit": limit}


async def list_ai_user_assets(*, user_id: str, group_by: str, status: str) -> dict[str, Any]:
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    await ensure_ai_session_image_assets(user_id)

    query: dict[str, Any] = {"scope": "ai_personal", "user_id": user_id}
    query["status"] = status if status else {"$ne": "hard_deleted"}

    grouped: dict[str, dict[str, Any]] = {}
    async for doc in db.file_assets.find(query).sort("created_at", -1):
        item = _serialize_mongo_value(doc)
        bucket = _date_bucket(doc.get("created_at") or item.get("conversation_date"), group_by)
        group = grouped.setdefault(bucket, {"date": bucket, "count": 0, "total_size": 0, "items": []})
        group["count"] += 1
        group["total_size"] += int(item.get("size", 0) or 0)
        group["items"].append(item)

    groups = sorted(grouped.values(), key=lambda item: item["date"], reverse=True)
    return {
        "user_id": user_id,
        "group_by": group_by,
        "groups": groups,
        "total": sum(group["count"] for group in groups),
    }


