from __future__ import annotations

from typing import Any

from backend.core.database import db


async def insert_job(document: dict[str, Any]):
    return await db.slides_delivery_jobs.insert_one(document)


async def find_job(
    *,
    job_id: str,
    user_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.slides_delivery_jobs.find_one({"job_id": job_id, "user_id": user_id}, projection)
