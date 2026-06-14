"""User CRUD endpoints."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from backend.core.security import get_admin_user
from backend.schemas import AuthSchema, UpdateProfileSchema
from backend.services.admin_user_service import (
    create_admin_user,
    delete_admin_user,
    list_admin_users,
    update_admin_user,
)
from .router import admin_router


@admin_router.get("/users")
async def get_users(admin: dict = Depends(get_admin_user)):
    return await list_admin_users()


@admin_router.post("/add_user")
async def add_user(req: AuthSchema, admin: dict = Depends(get_admin_user)):
    try:
        await create_admin_user(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "User created successfully"}


@admin_router.put("/update_user/{user_id}")
async def update_user(user_id: str, req: UpdateProfileSchema, admin: dict = Depends(get_admin_user)):
    try:
        await update_admin_user(user_id=user_id, payload=req, admin_user_id=str(admin["_id"]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "User updated successfully"}


@admin_router.delete("/delete_user/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_admin_user)):
    try:
        await delete_admin_user(user_id=user_id, admin_user_id=str(admin["_id"]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "User deleted successfully"}
