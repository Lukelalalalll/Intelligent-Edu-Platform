from __future__ import annotations

from fastapi import Depends, HTTPException, Query, Request

from backend.core.security import get_admin_user
from backend.schemas import AdminSecurityUnlockSchema, AdminUserStatusUpdateSchema
from backend.services.admin_security_service import (
    clear_lockout,
    get_security_overview,
    list_active_lockouts,
    list_security_events,
    list_user_security_statuses,
    update_user_security_status,
)
from backend.services.security_audit import record_security_event

from .router import admin_router


@admin_router.get("/security/overview")
async def admin_security_overview(admin: dict = Depends(get_admin_user)):
    return await get_security_overview()


@admin_router.get("/security/events")
async def admin_security_events(
    limit: int = Query(default=50, ge=1, le=200),
    action: str = Query(default="", max_length=120),
    level: str = Query(default="", max_length=20),
    user_id: str = Query(default="", max_length=120),
    admin: dict = Depends(get_admin_user),
):
    return await list_security_events(limit=limit, action=action, level=level, user_id=user_id)


@admin_router.get("/security/lockouts")
async def admin_security_lockouts(
    limit: int = Query(default=100, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    return await list_active_lockouts(limit=limit)


@admin_router.post("/security/lockouts/clear")
async def admin_security_clear_lockout(
    request: Request,
    payload: AdminSecurityUnlockSchema,
    admin: dict = Depends(get_admin_user),
):
    result = await clear_lockout(scope_key=payload.scope_key)
    if result["cleared"]:
        await record_security_event(
            level="warning",
            request_id=getattr(request.state, "request_id", "unknown"),
            user_id=str(admin.get("_id") or ""),
            endpoint="/api/admin/security/lockouts/clear",
            action="admin_lockout_cleared",
            detail="administrator cleared auth lockout",
            extra={"scope_key": payload.scope_key},
        )
    return result


@admin_router.get("/security/users")
async def admin_security_users(
    limit: int = Query(default=100, ge=1, le=200),
    status: str = Query(default="", max_length=20),
    q: str = Query(default="", max_length=120),
    admin: dict = Depends(get_admin_user),
):
    return await list_user_security_statuses(limit=limit, status=status, query=q)


@admin_router.post("/security/users/{user_id}/status")
async def admin_security_update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdateSchema,
    request: Request,
    admin: dict = Depends(get_admin_user),
):
    admin_id = str(admin.get("_id") or "")
    if admin_id == str(user_id) and payload.status != "active":
        raise HTTPException(status_code=400, detail="You cannot disable or suspend your own administrator account")

    updated = await update_user_security_status(user_id=user_id, status=payload.status, changed_by=admin_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")

    await record_security_event(
        level="warning",
        request_id=getattr(request.state, "request_id", "unknown"),
        user_id=admin_id,
        endpoint=f"/api/admin/security/users/{user_id}/status",
        action="admin_user_status_updated",
        detail=f"administrator set user status to {payload.status}",
        extra={"target_user_id": user_id, "target_status": payload.status},
    )
    return {"user": updated}
