from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo import ReturnDocument

from backend.core.database import db
from ._helpers import coerce_object_id


async def insert_asset(document: dict[str, Any]):
    return await db.file_assets.insert_one(document)


def _non_hard_deleted_status(status: str = "") -> str | dict[str, Any]:
    return status if status else {"$ne": "hard_deleted"}


def _non_hard_deleted_query(status: str = "") -> dict[str, Any]:
    return {"status": _non_hard_deleted_status(status)}


async def find_assets_by_owner(owner_type: str, owner_id: str) -> list[dict[str, Any]]:
    cursor = db.file_assets.find(
        {
            "owner_type": owner_type,
            "owner_id": str(owner_id),
            "status": {"$ne": "hard_deleted"},
        }
    ).sort("created_at", -1)
    return [item async for item in cursor]


async def list_assets_page(
    query: dict[str, Any],
    *,
    limit: int,
    skip: int,
) -> tuple[int, list[dict[str, Any]]]:
    total = await db.file_assets.count_documents(query)
    cursor = db.file_assets.find(query).sort("created_at", -1).skip(skip).limit(limit)
    return total, [item async for item in cursor]


async def find_asset_by_identifier(asset_id: str) -> dict[str, Any] | None:
    asset_oid = coerce_object_id(asset_id)
    query = {"_id": asset_oid} if asset_oid is not None else {"file_id": asset_id}
    return await db.file_assets.find_one(query)


async def list_room_assets(
    *,
    room_id: str,
    status: str = "",
) -> list[dict[str, Any]]:
    cursor = db.file_assets.find(
        {
            "room_id": room_id,
            "scope": "chat_group",
            "status": _non_hard_deleted_status(status),
        }
    ).sort("created_at", -1)
    return [item async for item in cursor]


async def count_chat_group_assets_by_room_ids(room_ids: list[str]) -> dict[str, int]:
    if not room_ids:
        return {}

    pipeline = [
        {
            "$match": {
                "room_id": {"$in": room_ids},
                "scope": "chat_group",
                "status": {"$ne": "hard_deleted"},
            }
        },
        {"$group": {"_id": "$room_id", "count": {"$sum": 1}}},
    ]
    counts: dict[str, int] = {}
    async for item in db.file_assets.aggregate(pipeline):
        counts[str(item["_id"])] = int(item.get("count", 0))
    return counts


async def list_ai_personal_assets_for_user(
    *,
    user_id: str,
    status: str = "",
) -> list[dict[str, Any]]:
    cursor = db.file_assets.find(
        {
            "scope": "ai_personal",
            "user_id": user_id,
            "status": _non_hard_deleted_status(status),
        }
    ).sort("created_at", -1)
    return [item async for item in cursor]


async def list_ai_personal_assets_page(
    *,
    user_id: str,
    status: str = "",
    group_by: str = "day",
    skip: int = 0,
    limit: int | None = 100,
) -> tuple[int, list[dict[str, Any]]]:
    query: dict[str, Any] = {
        "scope": "ai_personal",
        "user_id": user_id,
        **_non_hard_deleted_query(status),
    }
    total = await db.file_assets.count_documents(query)
    safe_skip = max(0, int(skip or 0))
    safe_limit = None if limit is None or int(limit or 0) <= 0 else max(1, int(limit or 1))
    bucket_format = "%Y-%m" if group_by == "month" else "%Y-%m-%d"
    bucket_len = 7 if group_by == "month" else 10

    pipeline = [
        {"$match": query},
        {"$sort": {"created_at": -1, "_id": -1}},
        {"$skip": safe_skip},
    ]
    if safe_limit is not None:
        pipeline.append({"$limit": safe_limit})
    pipeline.extend([
        {"$addFields": {"_bucket_source": {"$ifNull": ["$created_at", "$conversation_date"]}}},
        {
            "$addFields": {
                "_bucket": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {"$eq": [{"$type": "$_bucket_source"}, "date"]},
                                "then": {
                                    "$dateToString": {
                                        "format": bucket_format,
                                        "date": "$_bucket_source",
                                        "timezone": "UTC",
                                    }
                                },
                            },
                            {
                                "case": {"$eq": [{"$type": "$_bucket_source"}, "string"]},
                                "then": {
                                    "$cond": [
                                        {"$gt": [{"$strLenCP": "$_bucket_source"}, 0]},
                                        {"$substrCP": ["$_bucket_source", 0, bucket_len]},
                                        "unknown",
                                    ]
                                },
                            },
                        ],
                        "default": "unknown",
                    }
                }
            }
        },
        {
            "$group": {
                "_id": "$_bucket",
                "count": {"$sum": 1},
                "total_size": {"$sum": {"$ifNull": ["$size", 0]}},
                "items": {"$push": "$$ROOT"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "date": "$_id",
                "count": 1,
                "total_size": 1,
                "items": 1,
            }
        },
        {"$sort": {"date": -1}},
    ])
    groups: list[dict[str, Any]] = []
    async for item in db.file_assets.aggregate(pipeline):
        groups.append(item)
    return total, groups


async def count_ai_personal_assets_by_user_ids(user_ids: list[str]) -> dict[str, int]:
    if not user_ids:
        return {}

    pipeline = [
        {
            "$match": {
                "scope": "ai_personal",
                "user_id": {"$in": user_ids},
                "status": {"$ne": "hard_deleted"},
            }
        },
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    counts: dict[str, int] = {}
    async for item in db.file_assets.aggregate(pipeline):
        counts[str(item["_id"])] = int(item.get("count", 0))
    return counts


async def find_asset_by_file_id(file_id: str) -> dict[str, Any] | None:
    return await db.file_assets.find_one({"file_id": file_id})


async def list_non_hard_deleted_assets(
    *,
    projection: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    cursor = db.file_assets.find({"status": {"$ne": "hard_deleted"}}, projection)
    return [item async for item in cursor]


async def soft_delete_asset_by_file_id(
    *,
    file_id: str,
    now: datetime,
    actor_id: str,
    reason: str,
) -> dict[str, Any] | None:
    return await db.file_assets.find_one_and_update(
        {"file_id": file_id, "status": {"$ne": "hard_deleted"}},
        {
            "$set": {
                "status": "soft_deleted",
                "deleted_at": now,
                "updated_at": now,
                "deleted_by": actor_id,
                "delete_reason": reason,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def restore_asset_by_file_id(
    *,
    file_id: str,
    now: datetime,
    actor_id: str,
) -> dict[str, Any] | None:
    return await db.file_assets.find_one_and_update(
        {"file_id": file_id, "status": "soft_deleted"},
        {
            "$set": {
                "status": "active",
                "deleted_at": None,
                "updated_at": now,
                "restored_by": actor_id,
                "restored_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def mark_asset_hard_deleted(
    *,
    file_id: str,
    now: datetime,
    actor_id: str,
    deleted_from_disk: bool,
    deleted_from_session: bool,
) -> dict[str, Any] | None:
    await db.file_assets.update_one(
        {"file_id": file_id},
        {
            "$set": {
                "status": "hard_deleted",
                "updated_at": now,
                "hard_deleted_at": now,
                "hard_deleted_by": actor_id,
                "deleted_from_disk": deleted_from_disk,
                "deleted_from_session": deleted_from_session,
            }
        },
    )
    return await find_asset_by_file_id(file_id)


async def bind_chat_attachment_to_message(
    *,
    public_url: str,
    owner_id: str,
    room_id: str,
    user_id: str,
    now: datetime,
):
    return await db.file_assets.update_one(
        {
            "file_type": "chat_attachment",
            "public_url": str(public_url),
            "status": {"$ne": "hard_deleted"},
        },
        {
            "$set": {
                "owner_type": "chat_message",
                "owner_id": owner_id,
                "scope": "chat_group",
                "room_id": room_id,
                "user_id": user_id,
                "updated_at": now,
                "status": "active",
            }
        },
    )


async def soft_delete_knowledge_source_assets(
    *,
    course_id: str,
    filename: str,
    now: datetime,
    reason: str,
):
    return await db.file_assets.update_many(
        {
            "file_type": "knowledge_source",
            "course_id": course_id,
            "filename": filename,
            "status": {"$ne": "hard_deleted"},
        },
        {
            "$set": {
                "status": "soft_deleted",
                "deleted_at": now,
                "updated_at": now,
                "delete_reason": reason,
            }
        },
    )


async def aggregate_stats_by_type_and_status() -> list[dict[str, Any]]:
    pipeline = [
        {
            "$group": {
                "_id": {"file_type": "$file_type", "status": "$status"},
                "count": {"$sum": 1},
                "total_size": {"$sum": "$size"},
            }
        },
        {"$sort": {"_id.file_type": 1, "_id.status": 1}},
    ]
    rows: list[dict[str, Any]] = []
    async for item in db.file_assets.aggregate(pipeline):
        rows.append(item)
    return rows
