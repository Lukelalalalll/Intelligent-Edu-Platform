from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo import ReturnDocument

from backend.core.database import db
from backend.repositories._helpers import coerce_object_id

COLLECTION = "video_projects"


async def insert_project(document: dict[str, Any]):
    return await db[COLLECTION].insert_one(document)


async def find_project(project_id: str, *, user_id: str | None = None) -> dict[str, Any] | None:
    project_oid = coerce_object_id(project_id)
    if project_oid is None:
        return None
    query: dict[str, Any] = {"_id": project_oid}
    if user_id:
        query["user_id"] = user_id
    return await db[COLLECTION].find_one(query)


async def list_projects_page(
    *,
    user_id: str,
    limit: int,
    skip: int,
) -> tuple[int, list[dict[str, Any]]]:
    query = {"user_id": user_id}
    total = await db[COLLECTION].count_documents(query)
    cursor = (
        db[COLLECTION]
        .find(query)
        .sort([("updated_at", -1), ("created_at", -1)])
        .skip(skip)
        .limit(limit)
    )
    return total, [item async for item in cursor]


async def update_project(
    project_id: str,
    *,
    user_id: str | None = None,
    set_fields: dict[str, Any] | None = None,
    unset_fields: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    project_oid = coerce_object_id(project_id)
    if project_oid is None:
        return None
    query: dict[str, Any] = {"_id": project_oid}
    if user_id:
        query["user_id"] = user_id

    update: dict[str, Any] = {}
    if set_fields:
        update["$set"] = dict(set_fields)
    if unset_fields:
        update["$unset"] = dict(unset_fields)
    if not update:
        return await db[COLLECTION].find_one(query)
    return await db[COLLECTION].find_one_and_update(
        query,
        update,
        return_document=ReturnDocument.AFTER,
    )


async def replace_project(project_id: str, *, user_id: str | None = None, document: dict[str, Any]) -> dict[str, Any] | None:
    project_oid = coerce_object_id(project_id)
    if project_oid is None:
        return None
    query: dict[str, Any] = {"_id": project_oid}
    if user_id:
        query["user_id"] = user_id
    return await db[COLLECTION].find_one_and_replace(
        query,
        document,
        return_document=ReturnDocument.AFTER,
    )


async def append_event(
    project_id: str,
    *,
    user_id: str | None = None,
    event: dict[str, Any],
    status: str | None = None,
    current_step: str | None = None,
    progress: int | None = None,
    latest_error: str | None = None,
    updated_at: datetime | None = None,
) -> dict[str, Any] | None:
    project_oid = coerce_object_id(project_id)
    if project_oid is None:
        return None
    query: dict[str, Any] = {"_id": project_oid}
    if user_id:
        query["user_id"] = user_id

    set_fields: dict[str, Any] = {}
    if status is not None:
        set_fields["status"] = status
    if current_step is not None:
        set_fields["current_step"] = current_step
    if progress is not None:
        set_fields["progress"] = progress
    set_fields["latest_message"] = str(event.get("message") or "")
    if latest_error is not None:
        set_fields["latest_error"] = latest_error
    if updated_at is not None:
        set_fields["updated_at"] = updated_at

    update: dict[str, Any] = {"$push": {"events": event}}
    if set_fields:
        update["$set"] = set_fields

    return await db[COLLECTION].find_one_and_update(
        query,
        update,
        return_document=ReturnDocument.AFTER,
    )
