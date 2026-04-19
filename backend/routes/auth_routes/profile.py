"""Profile endpoints: courses, preferences, history settings."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import TeacherPreferencesSchema
from backend.services.grading_service import load_courses
from .router import (
    auth_router, _current_semester_label, _course_summary,
    _teacher_owns_course, _student_enrolled_in_course,
)


@auth_router.get("/profile/courses")
async def get_profile_courses(current_user: dict = Depends(get_current_user)):
    all_courses = (await load_courses()).get("courses", [])
    role = current_user.get("role", "student")

    if role == "admin":
        return {
            "role": role,
            "semester": _current_semester_label(),
            "courses": [_course_summary(c) for c in all_courses],
        }

    if role == "teacher":
        semester = _current_semester_label()
        teaching_courses = [c for c in all_courses if _teacher_owns_course(current_user, c)]
        current_semester_courses = [c for c in teaching_courses if str(c.get("semester") or "") == semester]
        selected = current_semester_courses if current_semester_courses else teaching_courses
        return {
            "role": role,
            "semester": semester,
            "courses": [_course_summary(c) for c in selected],
        }

    if role == "student":
        enrolled = [c for c in all_courses if _student_enrolled_in_course(current_user, c)]
        return {
            "role": role,
            "semester": _current_semester_label(),
            "courses": [_course_summary(c) for c in enrolled],
        }

    return {
        "role": role,
        "semester": _current_semester_label(),
        "courses": [],
    }


# ─── Teacher Preferences ──────────────────────────────────────────────

DEFAULT_TEACHER_PREFERENCES = {
    "feedback_style": "concise",
    "feedback_language": "English",
    "auto_rag": True,
    "default_rag_top_k": 4,
    "email_auto_classify": True,
    "email_suggest_reply": True,
}


@auth_router.get("/profile/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    """Get teacher AI preferences."""
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    prefs = (user_doc or {}).get("preferences", DEFAULT_TEACHER_PREFERENCES)
    return {"preferences": {**DEFAULT_TEACHER_PREFERENCES, **prefs}}


@auth_router.post("/profile/preferences")
async def update_preferences(
    payload: TeacherPreferencesSchema,
    current_user: dict = Depends(get_current_user),
):
    """Update teacher AI preferences."""
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"preferences": payload.model_dump()}},
    )
    return {"message": "Preferences updated", "preferences": payload.model_dump()}


# ── History TTL settings ──────────────────────────────────────────────

DEFAULT_HISTORY_TTL_DAYS = 90  # 0 means permanent (no auto-cleanup)


@auth_router.get("/profile/history-settings")
async def get_history_settings(current_user: dict = Depends(get_current_user)):
    """Get user's history auto-cleanup setting."""
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    ttl = (user_doc or {}).get("history_ttl_days", DEFAULT_HISTORY_TTL_DAYS)
    return {"history_ttl_days": ttl}


@auth_router.post("/profile/history-settings")
async def update_history_settings(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update user's history auto-cleanup setting.

    Accepts ``{ "history_ttl_days": <int> }`` where 0 means permanent.
    """
    ttl = payload.get("history_ttl_days")
    if ttl is None or not isinstance(ttl, int) or ttl < 0:
        raise HTTPException(status_code=400, detail="history_ttl_days must be a non-negative integer")
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"history_ttl_days": ttl}},
    )
    return {"message": "History settings updated", "history_ttl_days": ttl}
