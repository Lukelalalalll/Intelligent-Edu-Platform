"""Registration and password reset endpoints."""
from __future__ import annotations

from fastapi import HTTPException, Request

from backend.schemas import AuthSchema, PasswordResetConfirmSchema, PasswordResetRequestSchema
from backend.services.auth.auth_account_service import confirm_password_reset, register_user, request_password_reset_with_guards
from backend.services.auth.security_audit import record_security_event

from .router import limiter
from fastapi import APIRouter
router = APIRouter()


@router.post("/register")
@limiter.limit("10/minute")
async def register(request: Request, req: AuthSchema):
    await register_user(req)
    return {"message": "Account created successfully"}


@router.post("/password-reset/request")
@limiter.limit("5/minute")
async def reset_password_request(request: Request, req: PasswordResetRequestSchema):
    request_id = getattr(request.state, "request_id", "unknown")
    try:
        result = await request_password_reset_with_guards(req, request=request)
    except HTTPException as exc:
        if exc.status_code == 429:
            await record_security_event(
                level="warning",
                request_id=request_id,
                user_id="anonymous",
                endpoint="/api/password-reset/request",
                action="password_reset_locked_out",
                detail=str(exc.detail),
                extra={"identifier": (req.email or req.username or "")[:64]},
            )
        raise
    await record_security_event(
        level="info",
        request_id=request_id,
        user_id="anonymous",
        endpoint="/api/password-reset/request",
        action="password_reset_requested",
        detail="password reset request accepted",
        extra={"has_identifier": bool(req.email or req.username)},
    )
    return result


@router.post("/password-reset/confirm")
@limiter.limit("5/minute")
async def reset_password_confirm(request: Request, req: PasswordResetConfirmSchema):
    request_id = getattr(request.state, "request_id", "unknown")
    try:
        await confirm_password_reset(req)
    except HTTPException as exc:
        await record_security_event(
            level="warning",
            request_id=request_id,
            user_id="anonymous",
            endpoint="/api/password-reset/confirm",
            action="password_reset_failed",
            detail=str(exc.detail),
        )
        raise
    await record_security_event(
        level="warning",
        request_id=request_id,
        user_id="anonymous",
        endpoint="/api/password-reset/confirm",
        action="password_reset_confirmed",
        detail="password reset token redeemed",
    )
    return {"message": "Password reset successfully"}

