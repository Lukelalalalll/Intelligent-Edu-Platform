from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
import re
from typing import Any

from fastapi import HTTPException

from backend.repositories import study_plan_repo

STUDY_DURATION_PRESETS = {"3d": 3, "7d": 7, "14d": 14}


def resolve_study_days(duration_option: str, custom_days: int | None) -> int:
    option = str(duration_option or "").strip().lower()
    if option == "custom":
        if not custom_days:
            raise HTTPException(400, "custom_days is required when duration_option is custom")
        return int(custom_days)
    if option not in STUDY_DURATION_PRESETS:
        raise HTTPException(400, "duration_option must be one of 3d, 7d, 14d, custom")
    return int(STUDY_DURATION_PRESETS[option])


def extract_study_units(notes: str) -> list[str]:
    sections: list[str] = []
    for chunk in re.split(r"\n(?=##?\s+)", str(notes or "")):
        text = chunk.strip()
        if text:
            sections.append(text[:1400])
    if not sections:
        raw = str(notes or "").strip()
        if raw:
            sections.append(raw[:1400])
    return sections[:24]


async def generate_study_plan(*, payload: Any, current_user: dict) -> dict[str, Any]:
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
        review_slice = flashcards[review_slice_start : review_slice_start + 3] if flashcards else []

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
    await study_plan_repo.insert_plan(plan_doc)
    await study_plan_repo.insert_queue_items(queue_docs)
    return {
        "success": True,
        "plan_id": plan_id,
        "duration_days": total_days,
        "sessions": sessions,
    }


async def get_study_plan(*, plan_id: str, current_user: dict) -> dict[str, Any]:
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await study_plan_repo.find_plan(plan_id, user_id)
    if not doc:
        raise HTTPException(404, "Study plan not found")

    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "plan": doc}


async def get_next_review_item(*, plan_id: str | None, current_user: dict) -> dict[str, Any]:
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    now = datetime.now(timezone.utc)

    next_item = await study_plan_repo.find_next_due_item(user_id=user_id, now=now, plan_id=plan_id)
    if not next_item:
        upcoming = await study_plan_repo.find_upcoming_item(user_id=user_id, plan_id=plan_id)
        if upcoming:
            if hasattr(upcoming.get("due_at"), "isoformat"):
                upcoming["due_at"] = upcoming["due_at"].isoformat()
            return {"success": True, "ready": False, "next_upcoming": upcoming}
        return {"success": True, "ready": False, "message": "No review items available."}

    if hasattr(next_item.get("due_at"), "isoformat"):
        next_item["due_at"] = next_item["due_at"].isoformat()
    return {"success": True, "ready": True, "item": next_item}


async def submit_review_feedback(*, payload: Any, current_user: dict) -> dict[str, Any]:
    user_id = str(current_user.get("id") or current_user.get("_id") or "")
    doc = await study_plan_repo.find_queue_item(payload.queue_id, user_id)
    if not doc:
        raise HTTPException(404, "Review queue item not found")

    rating = str(payload.rating or "good").lower()
    step_map = {"again": 1, "hard": 2, "good": 4, "easy": 7}
    next_days = step_map.get(rating, 4)

    now = datetime.now(timezone.utc)
    next_due = now + timedelta(days=next_days)
    new_reps = int(doc.get("repetitions", 0)) + 1
    new_status = "pending" if payload.correct else "scheduled"

    await study_plan_repo.update_queue_feedback(
        queue_id=payload.queue_id,
        user_id=user_id,
        next_due=next_due,
        status=new_status,
        rating=rating,
        correct=bool(payload.correct),
        now=now,
    )
    return {
        "success": True,
        "queue_id": payload.queue_id,
        "next_due_at": next_due.isoformat(),
        "repetitions": new_reps,
        "status": new_status,
    }
