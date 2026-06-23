from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_user
from backend.services.user_profile_service import load_profile_courses

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/courses")
async def get_profile_courses(current_user: dict = Depends(get_current_user)):
    return await load_profile_courses(current_user)
