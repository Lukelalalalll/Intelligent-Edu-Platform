from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.database import db


async def insert_plan(document: dict[str, Any]):
    return await db.study_plan_profiles.insert_one(document)


async def insert_queue_items(items: list[dict[str, Any]]):
    if not items:
        return None
    return await db.study_review_queue.insert_many(items)


async def find_plan(plan_id: str, user_id: str) -> dict[str, Any] | None:
    return await db.study_plan_profiles.find_one({"plan_id": plan_id, "user_id": user_id}, {"_id": 0})


async def find_next_due_item(
    *,
    user_id: str,
    now: datetime,
    plan_id: str | None = None,
) -> dict[str, Any] | None:
    query: dict[str, Any] = {
        "user_id": user_id,
        "status": {"$in": ["scheduled", "pending"]},
        "due_at": {"$lte": now},
    }
    if plan_id:
        query["plan_id"] = plan_id
    return await db.study_review_queue.find_one(query, sort=[("due_at", 1)], projection={"_id": 0})


async def find_upcoming_item(*, user_id: str, plan_id: str | None = None) -> dict[str, Any] | None:
    query: dict[str, Any] = {"user_id": user_id, "status": {"$in": ["scheduled", "pending"]}}
    if plan_id:
        query["plan_id"] = plan_id
    return await db.study_review_queue.find_one(query, sort=[("due_at", 1)], projection={"_id": 0})


async def find_queue_item(queue_id: str, user_id: str) -> dict[str, Any] | None:
    return await db.study_review_queue.find_one({"queue_id": queue_id, "user_id": user_id})


async def update_queue_feedback(
    *,
    queue_id: str,
    user_id: str,
    next_due: datetime,
    status: str,
    rating: str,
    correct: bool,
    now: datetime,
):
    return await db.study_review_queue.update_one(
        {"queue_id": queue_id, "user_id": user_id},
        {
            "$set": {
                "due_at": next_due,
                "status": status,
                "last_rating": rating,
                "updated_at": now,
                "correct": bool(correct),
            },
            "$inc": {"repetitions": 1},
        },
    )
