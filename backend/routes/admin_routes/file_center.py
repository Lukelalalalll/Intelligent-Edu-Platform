"""File center views: chat rooms and AI user asset browsing."""
from __future__ import annotations

import os

from bson.objectid import ObjectId
from fastapi import Depends, HTTPException, Query

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_admin_user
from backend.services.file_asset_service import ensure_ai_session_image_assets
from .router import admin_router, _serialize_mongo_value, _date_bucket


@admin_router.get("/files/chat/rooms")
async def list_chat_rooms_for_file_center(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user)
):
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
        {"$limit": limit}
    ]
    rooms = []
    async for doc in db.chat_rooms.aggregate(pipeline):
        rooms.append(_serialize_mongo_value(doc))

    total = await db.chat_rooms.count_documents({"type": "group"})
    return {"rooms": rooms, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/files/chat/rooms/{room_id}/assets")
async def list_chat_room_assets(
    room_id: str,
    status: str = Query(default="", max_length=32),
    admin: dict = Depends(get_admin_user),
):
    query: dict = {"room_id": room_id, "scope": "chat_group"}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "hard_deleted"}

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


@admin_router.get("/files/ai/users")
async def list_ai_users_for_file_center(
    role: str = Query(default="student", pattern="^(teacher|student)$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    users = []
    cursor = db.users.find({"role": role}, {"username": 1, "email": 1, "role": 1}).sort("username", 1).skip(skip).limit(limit)
    async for u in cursor:
        uid = str(u.get("_id"))
        await ensure_ai_session_image_assets(uid)
        session_count = await db.ai_chat_sessions.count_documents({"userId": ObjectId(uid)})
        asset_count = await db.file_assets.count_documents(
            {"scope": "ai_personal", "user_id": uid, "status": {"$ne": "hard_deleted"}}
        )
        users.append(
            {
                "user_id": uid,
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", role),
                "session_count": session_count,
                "asset_count": asset_count,
            }
        )
    total = await db.users.count_documents({"role": role})
    return {"users": users, "total": total, "skip": skip, "limit": limit}


@admin_router.get("/files/ai/users/{user_id}/assets")
async def list_ai_user_assets(
    user_id: str,
    group_by: str = Query(default="day", pattern="^(day|month)$"),
    status: str = Query(default="", max_length=32),
    admin: dict = Depends(get_admin_user),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    await ensure_ai_session_image_assets(user_id)

    query: dict = {"scope": "ai_personal", "user_id": user_id}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "hard_deleted"}

    grouped: dict[str, dict] = {}
    async for doc in db.file_assets.find(query).sort("created_at", -1):
        item = _serialize_mongo_value(doc)
        bucket = _date_bucket(doc.get("created_at") or item.get("conversation_date"), group_by)
        if bucket not in grouped:
            grouped[bucket] = {"date": bucket, "count": 0, "total_size": 0, "items": []}
        grouped[bucket]["count"] += 1
        grouped[bucket]["total_size"] += int(item.get("size", 0) or 0)
        grouped[bucket]["items"].append(item)

    groups = sorted(grouped.values(), key=lambda x: x["date"], reverse=True)
    return {
        "user_id": user_id,
        "group_by": group_by,
        "groups": groups,
        "total": sum(g["count"] for g in groups),
    }
