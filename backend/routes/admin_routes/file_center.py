"""File center views: chat rooms and AI user asset browsing."""
from __future__ import annotations

from fastapi import Depends, Query

from backend.core.security import get_admin_user
from backend.services.files.file_center_service import (
    list_ai_user_assets,
    list_ai_users,
    list_chat_room_assets,
    list_chat_rooms,
)

from fastapi import APIRouter
router = APIRouter()


@router.get("/files/chat/rooms")
async def list_chat_rooms_for_file_center(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await list_chat_rooms(skip=skip, limit=limit)


@router.get("/files/chat/rooms/{room_id}/assets")
async def list_chat_room_assets_for_admin(
    room_id: str,
    status: str = Query(default="", max_length=32),
    admin: dict = Depends(get_admin_user),
):
    return await list_chat_room_assets(room_id=room_id, status=status)


@router.get("/files/ai/users")
async def list_ai_users_for_file_center(
    role: str = Query(default="student", pattern="^(teacher|student)$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await list_ai_users(role=role, skip=skip, limit=limit)


@router.get("/files/ai/users/{user_id}/assets")
async def list_ai_user_assets_for_admin(
    user_id: str,
    group_by: str = Query(default="day", pattern="^(day|month)$"),
    status: str = Query(default="", max_length=32),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=0, ge=0, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await list_ai_user_assets(user_id=user_id, group_by=group_by, status=status, skip=skip, limit=limit)
