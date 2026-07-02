from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument

from backend.core.database import db

COLLECTION = "video_script_jobs"


async def insert_job(document: dict[str, Any]):
    return await db[COLLECTION].insert_one(document)


async def find_job(job_id: str, *, user_id: str | None = None) -> dict[str, Any] | None:
    query: dict[str, Any] = {"job_id": job_id}
    if user_id:
        query["user_id"] = user_id
    return await db[COLLECTION].find_one(query)


async def update_job(job_id: str, *, user_id: str | None = None, set_fields: dict[str, Any]) -> dict[str, Any] | None:
    query: dict[str, Any] = {"job_id": job_id}
    if user_id:
        query["user_id"] = user_id
    return await db[COLLECTION].find_one_and_update(
        query,
        {"$set": dict(set_fields)},
        return_document=ReturnDocument.AFTER,
    )
