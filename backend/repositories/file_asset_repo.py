from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo import ReturnDocument

from backend.core.database import db
from ._helpers import coerce_object_id


async def insert_asset(document: dict[str, Any]):
    return await db.file_assets.insert_one(document)


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
