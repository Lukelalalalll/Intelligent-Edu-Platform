from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.database import db

COLLECTION = "indexing_jobs"


async def mark_deleted_jobs(*, course_id: str, filename: str, now: datetime):
    return await db[COLLECTION].update_many(
        {
            "course_id": course_id,
            "filename": filename,
            "status": "done",
        },
        {"$set": {"status": "deleted", "updated_at": now}},
    )


async def set_dispatch_job_id(*, job_id: str, dispatch_job_id: str, now: datetime):
    return await db[COLLECTION].update_one(
        {"job_id": job_id},
        {"$set": {"dispatch_job_id": dispatch_job_id, "updated_at": now}},
    )


async def find_job(job_id: str, projection: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return await db[COLLECTION].find_one({"job_id": job_id}, projection)


async def find_latest_successful_job(
    *,
    course_id: str,
    filename: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db[COLLECTION].find_one(
        {"course_id": course_id, "filename": filename, "status": "done"},
        projection,
        sort=[("created_at", -1)],
    )
