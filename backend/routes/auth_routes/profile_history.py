from __future__ import annotations

from fastapi import Depends, HTTPException

from backend.core.security import get_current_user
from backend.services.auth.user_profile_service import load_history_settings, save_history_settings

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/history-settings")
async def get_history_settings(current_user: dict = Depends(get_current_user)):
    return await load_history_settings(current_user)


@router.post("/profile/history-settings")
async def update_history_settings(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    ttl = payload.get("history_ttl_days")
    if ttl is None or not isinstance(ttl, int):
        raise HTTPException(status_code=400, detail="history_ttl_days must be a non-negative integer")
    return await save_history_settings(current_user, ttl)
