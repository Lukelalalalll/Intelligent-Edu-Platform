from __future__ import annotations

import copy

from fastapi import HTTPException

from backend.core.database import db

DEFAULT_HISTORY_TTL_DAYS = 90

_DEFAULT_PREFS = {
    "feedback_style": "concise",
    "feedback_language": "English",
    "auto_rag": True,
    "default_rag_top_k": 4,
    "email_auto_classify": True,
    "email_suggest_reply": True,
}


def get_default_preferences() -> dict:
    return copy.deepcopy(_DEFAULT_PREFS)


async def load_profile_courses(current_user: dict) -> dict:
    from backend.services.student.enrollment_service import get_user_course_profile

    return await get_user_course_profile(current_user)


async def load_preferences(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    prefs = (user_doc or {}).get("preferences", get_default_preferences())
    return {"preferences": {**get_default_preferences(), **prefs}}


async def save_preferences(current_user: dict, payload: dict) -> dict:
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"preferences": payload}},
    )
    return {"message": "Preferences updated", "preferences": payload}


async def load_history_settings(current_user: dict) -> dict:
    user_doc = await db.users.find_one({"_id": current_user["_id"]})
    ttl = (user_doc or {}).get("history_ttl_days", DEFAULT_HISTORY_TTL_DAYS)
    return {"history_ttl_days": ttl}


async def save_history_settings(current_user: dict, ttl: int) -> dict:
    if ttl < 0:
        raise HTTPException(
            status_code=400,
            detail="history_ttl_days must be a non-negative integer",
        )
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"history_ttl_days": ttl}},
    )
    return {"message": "History settings updated", "history_ttl_days": ttl}
