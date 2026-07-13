"""Session, logout, and self-profile auth endpoints."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, Response

from backend.config import Config
from backend.core.security import get_current_user
from backend.schemas import SelfUpdateProfileSchema
from backend.services.auth.auth_account_service import serialize_session_user, update_current_profile
from backend.services.auth.auth_session_service import (
    list_user_sessions,
    revoke_all_sessions_for_user,
    revoke_current_session,
    revoke_user_session,
    rotate_refresh_session,
)
from backend.services.auth.security_audit import record_security_event

from .auth_cookies import _clear_auth_cookies, _set_auth_cookies, _set_csrf_cookie
from fastapi import APIRouter
router = APIRouter()


@router.post("/refresh")
async def refresh_session(request: Request, response: Response):
    refresh_token = request.cookies.get(Config.JWT_REFRESH_COOKIE_NAME)
    if not refresh_token:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token missing")

    rotated = await rotate_refresh_session(refresh_token=refresh_token, request=request)
    _set_auth_cookies(
        response=response,
        access_token=rotated["access_token"],
        refresh_token=rotated["refresh_token"],
    )
    return {
        "message": "Session refreshed",
        "user": serialize_session_user(rotated["user"]),
    }


@router.post("/logout")
async def logout(response: Response, current_user: dict = Depends(get_current_user)):
    session_id = str(current_user.get("session_id") or "")
    if session_id:
        await revoke_current_session(session_id, reason="logout")
    _clear_auth_cookies(response)
    return {"message": "Logout successful"}


@router.post("/logout-all")
async def logout_all(response: Response, current_user: dict = Depends(get_current_user)):
    await revoke_all_sessions_for_user(str(current_user.get("_id") or ""), reason="logout-all")
    _clear_auth_cookies(response)
    return {"message": "All sessions logged out successfully"}


@router.get("/session")
async def get_session(response: Response, current_user: dict = Depends(get_current_user)):
    _set_csrf_cookie(response)
    return {"user": serialize_session_user(current_user)}


@router.get("/sessions")
async def get_sessions(current_user: dict = Depends(get_current_user)):
    sessions = await list_user_sessions(
        user_id=str(current_user.get("_id") or ""),
        current_session_id=str(current_user.get("session_id") or ""),
    )
    return {"sessions": sessions}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    current_session_id = str(current_user.get("session_id") or "")
    if session_id == current_session_id:
        raise HTTPException(status_code=409, detail="Use /logout to revoke the current session")
    await revoke_user_session(user_id=str(current_user.get("_id") or ""), session_id=session_id)
    return {"message": "Session revoked successfully"}


@router.post("/profile/update")
async def update_profile(
    request: Request,
    req: SelfUpdateProfileSchema,
    current_user: dict = Depends(get_current_user),
):
    await update_current_profile(current_user=current_user, payload=req)
    await record_security_event(
        level="info",
        request_id=getattr(request.state, "request_id", "unknown"),
        user_id=str(current_user.get("_id") or ""),
        endpoint="/api/profile/update",
        action="profile_updated",
        detail="user updated profile settings",
    )
    return {"message": "Profile updated successfully"}

