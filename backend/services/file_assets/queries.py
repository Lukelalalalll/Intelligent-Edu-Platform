from __future__ import annotations

from typing import Any

from backend.repositories import file_asset_repo

from .shared import absolute_from_storage_path, to_iso


async def find_by_owner(owner_type: str, owner_id: str) -> list[dict[str, Any]]:
    return [to_iso(item) for item in await file_asset_repo.find_assets_by_owner(owner_type, owner_id)]


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

    total, docs = await file_asset_repo.list_assets_page(query, limit=limit, skip=skip)
    documents = [to_iso(item) for item in docs]
    for document in documents:
        path = absolute_from_storage_path(document.get("storage_path", ""))
        document["exists_on_disk"] = path.is_file() or path.is_dir()
    return {"total": total, "assets": documents}


async def get_asset(asset_id: str) -> dict[str, Any] | None:
    document = await file_asset_repo.find_asset_by_identifier(asset_id)
    if not document:
        return None

    payload = to_iso(document)
    path = absolute_from_storage_path(payload.get("storage_path", ""))
    payload["exists_on_disk"] = path.is_file() or path.is_dir()
    return payload
