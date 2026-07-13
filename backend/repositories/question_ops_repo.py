from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.database import db


async def find_latest_generation_result_for_user(user_id: str) -> dict[str, Any] | None:
    return await db.sub2_generation_history.find_one({"user_id": user_id}, sort=[("created_at", -1)])


async def insert_run(document: dict[str, Any]):
    return await db.question_ops_runs.insert_one(document)


async def insert_items(items: list[dict[str, Any]]):
    if not items:
        return None
    return await db.question_ops_items.insert_many(items)


async def find_run(
    run_id: str,
    user_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.question_ops_runs.find_one({"run_id": run_id, "user_id": user_id}, projection)


async def list_items(
    run_id: str,
    *,
    projection: dict[str, Any] | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    cursor = db.question_ops_items.find({"run_id": run_id}, projection).sort("item_id", 1).limit(limit)
    return await cursor.to_list(length=limit)


async def list_all_items(run_id: str, *, limit: int = 2000) -> list[dict[str, Any]]:
    return await db.question_ops_items.find({"run_id": run_id}).to_list(length=limit)


async def update_item_status(run_id: str, item_id: str, *, status: str, now: datetime):
    return await db.question_ops_items.update_one(
        {"run_id": run_id, "item_id": item_id},
        {"$set": {"status": status, "updated_at": now}},
    )


async def update_run_dedupe_summary(
    *,
    run_id: str,
    threshold: float,
    kept: int,
    removed: int,
    now: datetime,
):
    return await db.question_ops_runs.update_one(
        {"run_id": run_id},
        {
            "$set": {
                "updated_at": now,
                "dedupe_threshold": threshold,
                "summary.after_dedupe_kept": kept,
                "summary.after_dedupe_removed": removed,
            }
        },
    )
