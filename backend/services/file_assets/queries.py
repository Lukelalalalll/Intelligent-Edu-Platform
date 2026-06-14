from __future__ import annotations

from typing import Any

from bson import ObjectId

from backend.core.database import db

from .shared import absolute_from_storage_path, to_iso


async def find_by_owner(owner_type: str, owner_id: str) -> list[dict[str, Any]]:
    cursor = db.file_assets.find(
        {
            "owner_type": owner_type,
            "owner_id": str(owner_id),
            "status": {"$ne": "hard_deleted"},
        }
    ).sort("created_at", -1)
    return [to_iso(item) async for item in cursor]


async def list_assets(
    *,
    file_type: str = "",
    status: str = "",
    owner_type: str = "",
    course_id: str = "",
    created_by: str = "",
    q: str = "",
    limit: int = 100,
    skip: int = 0,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if file_type:
        query["file_type"] = file_type
    if status:
        query["status"] = status
    if owner_type:
        query["owner_type"] = owner_type
    if course_id:
        query["course_id"] = course_id
    if created_by:
        query["created_by"] = created_by

    keyword = str(q or "").strip()
    if keyword:
        escaped = keyword.replace(".", "\\.")
        query["$or"] = [
            {"filename": {"$regex": escaped, "$options": "i"}},
            {"storage_path": {"$regex": escaped, "$options": "i"}},
            {"owner_id": {"$regex": escaped, "$options": "i"}},
            {"course_id": {"$regex": escaped, "$options": "i"}},
        ]

    total = await db.file_assets.count_documents(query)
    cursor = db.file_assets.find(query).sort("created_at", -1).skip(skip).limit(limit)
    documents = [to_iso(item) async for item in cursor]
    for document in documents:
        path = absolute_from_storage_path(document.get("storage_path", ""))
        document["exists_on_disk"] = path.is_file() or path.is_dir()
    return {"total": total, "assets": documents}


async def get_asset(asset_id: str) -> dict[str, Any] | None:
    if ObjectId.is_valid(asset_id):
        query = {"_id": ObjectId(asset_id)}
    else:
        query = {"file_id": asset_id}

    document = await db.file_assets.find_one(query)
    if not document:
        return None

    payload = to_iso(document)
    path = absolute_from_storage_path(payload.get("storage_path", ""))
    payload["exists_on_disk"] = path.is_file() or path.is_dir()
    return payload
