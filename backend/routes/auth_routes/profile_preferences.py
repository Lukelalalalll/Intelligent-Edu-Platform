from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_user
from backend.schemas import TeacherPreferencesSchema
from backend.services.auth.user_profile_service import load_preferences, save_preferences

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    return await load_preferences(current_user)


@router.post("/profile/preferences")
async def update_preferences(
    payload: TeacherPreferencesSchema,
    current_user: dict = Depends(get_current_user),
):
    return await save_preferences(current_user, payload.model_dump())
