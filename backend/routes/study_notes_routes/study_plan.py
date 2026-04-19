"""Study plan generation and spaced-repetition review endpoints."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException

from backend.core.database import db
from backend.core.security import get_current_user
from .helpers import (
    StudyPlanGenerateSchema,
    StudyReviewSubmitSchema,
    extract_study_units,
    resolve_study_days,
)
from .router import study_notes_router


@study_notes_router.post("/plan/generate")
async def generate_study_plan(
    payload: StudyPlanGenerateSchema,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    if not user_id:
        raise HTTPException(401, "Unauthorized")

    total_days = resolve_study_days(payload.duration_option, payload.custom_days)
    units = extract_study_units(payload.notes)
    if not units:
        raise HTTPException(400, "Insufficient notes content to build a study plan")

    flashcards = payload.flashcards or []
    now = datetime.now(timezone.utc)
    plan_id = uuid.uuid4().hex[:14]

    sessions: list[dict[str, Any]] = []
    queue_docs: list[dict[str, Any]] = []
    for idx, unit in enumerate(units, start=1):
        day_offset = min(total_days - 1, int((idx - 1) * total_days / max(1, len(units))))
        due_at = now + timedelta(days=day_offset)
        queue_id = f"{plan_id}-u{idx}"

        review_slice_start = (idx - 1) % max(1, len(flashcards) or 1)
        review_slice = flashcards[review_slice_start: review_slice_start + 3] if flashcards else []

        session = {
            "session_id": f"S{idx}",
            "day": day_offset + 1,
            "focus": unit.splitlines()[0][:120],
            "reading_minutes": 20,
            "review_minutes": 10,
            "practice_minutes": 15,
            "review_flashcards": review_slice,
            "queue_id": queue_id,
            "status": "scheduled",
        }
        sessions.append(session)

        queue_docs.append(
            {
                "queue_id": queue_id,
                "plan_id": plan_id,
                "user_id": user_id,
                "due_at": due_at,
                "status": "scheduled",
                "repetitions": 0,
                "last_rating": None,
                "unit_index": idx,
                "focus": session["focus"],
                "created_at": now,
                "updated_at": now,
            }
        )

    plan_doc = {
        "plan_id": plan_id,
        "user_id": user_id,
        "course_id": payload.course_id,
        "title": payload.title,
        "duration_days": total_days,
        "duration_option": payload.duration_option,
        "custom_days": payload.custom_days,
        "session_count": len(sessions),
        "sessions": sessions,
        "created_at": now,
        "updated_at": now,
    }

    await db.study_plan_profiles.insert_one(plan_doc)
    if queue_docs:
        await db.study_review_queue.insert_many(queue_docs)

    return {
        "success": True,
        "plan_id": plan_id,
        "duration_days": total_days,
        "sessions": sessions,
    }


@study_notes_router.get("/plan/{plan_id}")
async def get_study_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await db.study_plan_profiles.find_one({"plan_id": plan_id, "user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Study plan not found")

    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "plan": doc}


@study_notes_router.post("/review/next")
async def get_next_review_item(plan_id: str | None = None, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    now = datetime.now(timezone.utc)

    query: dict[str, Any] = {
        "user_id": user_id,
        "status": {"$in": ["scheduled", "pending"]},
        "due_at": {"$lte": now},
    }
    if plan_id:
        query["plan_id"] = plan_id

    next_item = await db.study_review_queue.find_one(query, sort=[("due_at", 1)], projection={"_id": 0})
    if not next_item:
        upcoming = await db.study_review_queue.find_one(
            {"user_id": user_id, **({"plan_id": plan_id} if plan_id else {}), "status": {"$in": ["scheduled", "pending"]}},
            sort=[("due_at", 1)],
            projection={"_id": 0},
        )
        if upcoming:
            if hasattr(upcoming.get("due_at"), "isoformat"):
                upcoming["due_at"] = upcoming["due_at"].isoformat()
            return {"success": True, "ready": False, "next_upcoming": upcoming}
        return {"success": True, "ready": False, "message": "No review items available."}

    if hasattr(next_item.get("due_at"), "isoformat"):
        next_item["due_at"] = next_item["due_at"].isoformat()
    return {"success": True, "ready": True, "item": next_item}


@study_notes_router.post("/review/submit")
async def submit_review_feedback(payload: StudyReviewSubmitSchema, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await db.study_review_queue.find_one({"queue_id": payload.queue_id, "user_id": user_id})
    if not doc:
        raise HTTPException(404, "Review queue item not found")

    rating = str(payload.rating or "good").lower()
    step_map = {"again": 1, "hard": 2, "good": 4, "easy": 7}
    next_days = step_map.get(rating, 4)

    now = datetime.now(timezone.utc)
    next_due = now + timedelta(days=next_days)
    new_reps = int(doc.get("repetitions", 0)) + 1
    new_status = "pending" if payload.correct else "scheduled"

    await db.study_review_queue.update_one(
        {"queue_id": payload.queue_id, "user_id": user_id},
        {
            "$set": {
                "due_at": next_due,
                "status": new_status,
                "last_rating": rating,
                "updated_at": now,
                "correct": bool(payload.correct),
            },
            "$inc": {"repetitions": 1},
        },
    )

    return {
        "success": True,
        "queue_id": payload.queue_id,
        "next_due_at": next_due.isoformat(),
        "repetitions": new_reps,
        "status": new_status,
    }
