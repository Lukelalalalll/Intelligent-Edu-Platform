from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from bson.objectid import ObjectId
from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.repositories import ai_session_repo, chat_room_repo, file_asset_repo, user_repo
from backend.repositories._helpers import coerce_object_id, require_object_id
from backend.services.files.file_asset_service import ensure_ai_session_image_assets


def _serialize_mongo_value(value: Any):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_mongo_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_mongo_value(item) for key, item in value.items()}
    return value


def _normalize_skip_limit(
    skip: int,
    limit: int,
    *,
    max_limit: int = 500,
    allow_unlimited: bool = False,
) -> tuple[int, int | None]:
    safe_skip = max(0, int(skip or 0))
    if allow_unlimited and int(limit or 0) <= 0:
        return safe_skip, None
    safe_limit = max(1, min(max_limit, int(limit or 1)))
    return safe_skip, safe_limit


async def list_chat_rooms(*, skip: int, limit: int) -> dict[str, Any]:
    safe_skip, safe_limit = _normalize_skip_limit(skip, limit)
    total, room_docs = await chat_room_repo.list_group_rooms_page(
        skip=safe_skip,
        limit=safe_limit,
        projection={"name": 1, "type": 1, "courseId": 1, "members": 1, "createdAt": 1},
    )
    room_ids = [str(doc.get("_id")) for doc in room_docs]
    asset_counts = await file_asset_repo.count_chat_group_assets_by_room_ids(room_ids)

    rooms = []
    for doc in room_docs:
        room_id = str(doc.get("_id"))
        members = doc.get("members") if isinstance(doc.get("members"), list) else []
        rooms.append(
            _serialize_mongo_value(
                {
                    "room_id": room_id,
                    "name": doc.get("name", ""),
                    "type": doc.get("type", "group"),
                    "course_id": doc.get("courseId", ""),
                    "member_count": len(members),
                    "asset_count": asset_counts.get(room_id, 0),
                    "created_at": doc.get("createdAt"),
                }
            )
        )

    next_skip = safe_skip + len(rooms)
    has_more = next_skip < total
    return {
        "rooms": rooms,
        "total": total,
        "skip": safe_skip,
        "limit": safe_limit,
        "hasMore": has_more,
        "nextSkip": next_skip if has_more else None,
    }


async def list_chat_room_assets(*, room_id: str, status: str) -> dict[str, Any]:
    room = None
    room_oid = coerce_object_id(room_id)
    if room_oid is not None:
        room = await chat_room_repo.find_by_id(room_oid, {"name": 1, "courseId": 1, "type": 1})

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


async def list_ai_user_assets(
    *,
    user_id: str,
    group_by: str,
    status: str,
    skip: int = 0,
    limit: int = 0,
) -> dict[str, Any]:
    try:
        require_object_id(user_id, detail="Invalid user id")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await ensure_ai_session_image_assets(user_id)
    safe_skip, safe_limit = _normalize_skip_limit(skip, limit, allow_unlimited=True)
    safe_group_by = "month" if group_by == "month" else "day"
    total, raw_groups = await file_asset_repo.list_ai_personal_assets_page(
        user_id=user_id,
        status=status,
        group_by=safe_group_by,
        skip=safe_skip,
        limit=safe_limit,
    )

    groups = []
    page_count = 0
    for raw_group in raw_groups:
        items = []
        for doc in raw_group.get("items", []):
            item = _serialize_mongo_value(doc)
            item.pop("_bucket_source", None)
            item.pop("_bucket", None)
            items.append(item)
        count = int(raw_group.get("count", len(items)) or 0)
        page_count += count
        groups.append(
            {
                "date": raw_group.get("date", "unknown"),
                "count": count,
                "total_size": int(raw_group.get("total_size", 0) or 0),
                "items": items,
            }
        )

    next_skip = safe_skip + page_count
    has_more = next_skip < total
    return {
        "user_id": user_id,
        "group_by": safe_group_by,
        "groups": groups,
        "total": total,
        "skip": safe_skip,
        "limit": safe_limit or 0,
        "hasMore": has_more,
        "nextSkip": next_skip if has_more else None,
    }
