from __future__ import annotations

from fastapi import Depends, Request

from backend.core.security import get_current_user
from backend.schemas import GoogleLoginSchema
from backend.services.auth.auth_account_service import serialize_session_user
from backend.services.auth.google_auth_service import (
    build_google_account_summary,
    link_google_account_for_user,
    unlink_google_account_for_user,
)
from backend.services.auth.security_audit import record_security_event

from fastapi import APIRouter
router = APIRouter()


@router.get("/profile/connections/google")
async def get_google_connection(current_user: dict = Depends(get_current_user)):
    return build_google_account_summary(current_user)


@router.post("/profile/connections/google/link")
async def link_google_connection(
    request: Request,
    payload: GoogleLoginSchema,
    current_user: dict = Depends(get_current_user),
):
    user_doc = await link_google_account_for_user(user_doc=current_user, credential=payload.credential)
    await record_security_event(
        level="info",
        request_id=getattr(request.state, "request_id", "unknown"),
        user_id=str(current_user.get("_id") or ""),
        endpoint="/api/profile/connections/google/link",
        action="profile_google_linked",
        detail="user linked a Google account from profile settings",
    )
    return {
        "message": "Google account linked successfully",
        "user": serialize_session_user(user_doc),
        "google": build_google_account_summary(user_doc),
    }


@router.delete("/profile/connections/google")
async def unlink_google_connection(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    user_doc = await unlink_google_account_for_user(user_doc=current_user)
    await record_security_event(
        level="info",
        request_id=getattr(request.state, "request_id", "unknown"),
        user_id=str(current_user.get("_id") or ""),
        endpoint="/api/profile/connections/google",
        action="profile_google_unlinked",
        detail="user unlinked a Google account from profile settings",
    )
    return {
        "message": "Google account unlinked successfully",
        "user": serialize_session_user(user_doc),
        "google": build_google_account_summary(user_doc),
    }

