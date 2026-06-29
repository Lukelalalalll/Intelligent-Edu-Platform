from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from bson.objectid import ObjectId
from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.repositories import ai_session_repo, file_asset_repo, user_repo
from backend.repositories._helpers import coerce_object_id, require_object_id
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
    room = None
    room_oid = coerce_object_id(room_id)
    if room_oid is not None:
        room = await db.chat_rooms.find_one({"_id": room_oid}, {"name": 1, "courseId": 1, "type": 1})

    assets = []
    for doc in await file_asset_repo.list_room_assets(room_id=room_id, status=status):
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
    users = await user_repo.list_users(
        filt={"role": role},
        projection={"username": 1, "email": 1, "role": 1},
        sort=[("username", 1)],
        skip=skip,
        limit=limit,
    )
    total = await user_repo.count_users({"role": role})

    user_ids = [str(user.get("_id")) for user in users]
    for user_id in user_ids:
        await ensure_ai_session_image_assets(user_id)

    session_counts = await ai_session_repo.count_sessions_by_user_ids(user_ids)
    asset_counts = await file_asset_repo.count_ai_personal_assets_by_user_ids(user_ids)

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
    try:
        require_object_id(user_id, detail="Invalid user id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await ensure_ai_session_image_assets(user_id)

    grouped: dict[str, dict[str, Any]] = {}
    for doc in await file_asset_repo.list_ai_personal_assets_for_user(user_id=user_id, status=status):
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


