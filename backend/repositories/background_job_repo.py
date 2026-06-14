from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo import ReturnDocument

from backend.core.database import db

COLLECTION = "background_jobs"


async def insert_job(document: dict[str, Any]):
    return await db[COLLECTION].insert_one(document)


async def claim_job(
    *,
    worker_id: str,
    now: datetime,
    lease_expires_at: datetime,
    job_types: list[str] | None = None,
    job_id: str | None = None,
) -> dict[str, Any] | None:
    query: dict[str, Any] = {
        "$or": [
            {"status": "pending", "available_at": {"$lte": now}},
            {"status": "running", "lease_expires_at": {"$lte": now}},
        ]
    }
    if job_types:
        query["job_type"] = {"$in": job_types}
    if job_id:
        query["job_id"] = job_id

    return await db[COLLECTION].find_one_and_update(
        query,
        {
            "$set": {
                "status": "running",
                "claimed_by": worker_id,
                "claimed_at": now,
                "lease_expires_at": lease_expires_at,
                "updated_at": now,
                "last_error": "",
            },
            "$inc": {"attempts": 1},
        },
        sort=[("available_at", 1), ("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )


async def mark_done(
    *,
    job_id: str,
    worker_id: str,
    now: datetime,
    result: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db[COLLECTION].find_one_and_update(
        {"job_id": job_id, "status": "running", "claimed_by": worker_id},
        {
            "$set": {
                "status": "done",
                "result": result,
                "updated_at": now,
                "completed_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def mark_failed(
    *,
    job_id: str,
    worker_id: str,
    now: datetime,
    error: str,
) -> dict[str, Any] | None:
    return await db[COLLECTION].find_one_and_update(
        {"job_id": job_id, "status": "running", "claimed_by": worker_id},
        {
            "$set": {
                "status": "failed",
                "last_error": error,
                "updated_at": now,
                "failed_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )


async def find_job(job_id: str, projection: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return await db[COLLECTION].find_one({"job_id": job_id}, projection)
