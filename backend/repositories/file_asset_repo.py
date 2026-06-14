from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.database import db


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
