"""Password and MFA login endpoints."""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request, Response

from backend.config import Config
from backend.schemas import AuthSchema, MfaChallengeVerifySchema
from backend.services.auth.auth_account_service import authenticate_user_with_guards, serialize_session_user
from backend.services.auth.auth_session_service import create_authenticated_session
from backend.services.auth.login_challenge_service import create_login_challenge, verify_login_challenge
from backend.services.auth.security_audit import record_security_event

from .auth_cookies import _set_auth_cookies, _set_mfa_challenge_cookie
from .router import limiter
from fastapi import APIRouter
router = APIRouter()

logger = logging.getLogger(__name__)


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, req: AuthSchema, response: Response):
    request_id = getattr(request.state, "request_id", "unknown")
    try:
        user = await authenticate_user_with_guards(req.username, req.password, request=request)
    except HTTPException as exc:
        if exc.status_code == 429:
            await record_security_event(
                level="warning",
                request_id=request_id,
                user_id="anonymous",
                endpoint="/api/login",
                action="login_locked_out",
                detail=str(exc.detail),
                extra={"username": req.username[:64]},
            )
        raise
    if not user:
        await record_security_event(
            level="warning",
            request_id=request_id,
            user_id="anonymous",
            endpoint="/api/login",
            action="login_failed",
            detail="invalid credentials",
            extra={"username": req.username[:64]},
        )
        raise HTTPException(status_code=401, detail="Wrong username or password")

    if bool((user.get("mfa") or {}).get("enabled")):
        challenge = await create_login_challenge(user=user, request=request, primary_auth_method="pwd")
        _set_mfa_challenge_cookie(response=response, challenge_id=challenge["challengeId"])
        await record_security_event(
            level="info",
            request_id=request_id,
            user_id=str(user.get("_id") or ""),
            endpoint="/api/login",
            action="login_mfa_challenge_issued",
            detail="primary credential verified, MFA required",
        )
        return {
            "message": "MFA verification required",
            "mfaRequired": True,
            "challengeId": challenge["challengeId"],
            "method": challenge["method"],
            "expiresAt": challenge["expiresAt"],
        }

    session_bundle = await create_authenticated_session(user=user, request=request)
    try:
        _set_auth_cookies(
            response=response,
            access_token=session_bundle["access_token"],
            refresh_token=session_bundle["refresh_token"],
        )
    except HTTPException:
        logger.error(
            "Refusing insecure auth cookie settings in production | rid=%s user=%s secure=%s samesite=%s",
            request_id,
            str(user.get("_id") or ""),
            Config.JWT_COOKIE_SECURE,
            Config.JWT_COOKIE_SAMESITE,
        )
        raise

    await record_security_event(
        level="info",
        request_id=request_id,
        user_id=str(user.get("_id") or ""),
        endpoint="/api/login",
        action="login_success",
        detail="user authenticated and session issued",
    )

    return {
        "message": "Login successful",
        "mfaRequired": False,
        "user": serialize_session_user(user),
    }


@router.post("/login/mfa/verify")
@limiter.limit("20/minute")
async def verify_login_mfa(
    request: Request,
    req: MfaChallengeVerifySchema,
    response: Response,
):
    request_id = getattr(request.state, "request_id", "unknown")
    challenge_cookie = request.cookies.get(Config.JWT_MFA_CHALLENGE_COOKIE_NAME)
    if not challenge_cookie or challenge_cookie != req.challenge_id:
        await record_security_event(
            level="warning",
            request_id=request_id,
            user_id="anonymous",
            endpoint="/api/login/mfa/verify",
            action="login_mfa_challenge_mismatch",
            detail="MFA challenge mismatch",
        )
        raise HTTPException(status_code=401, detail="MFA challenge mismatch")

    try:
        verified = await verify_login_challenge(challenge_id=req.challenge_id, code=req.code, request=request)
    except HTTPException as exc:
        await record_security_event(
            level="warning",
            request_id=request_id,
            user_id="anonymous",
            endpoint="/api/login/mfa/verify",
            action="login_mfa_failed",
            detail=str(exc.detail),
        )
        raise
    user = verified["user"]
    auth_method = str(verified.get("auth_method") or "otp")
    primary_auth_method = str(verified.get("primary_auth_method") or "pwd")
    session_bundle = await create_authenticated_session(
        user=user,
        request=request,
        amr=[primary_auth_method, auth_method],
    )
    try:
        _set_auth_cookies(
            response=response,
            access_token=session_bundle["access_token"],
            refresh_token=session_bundle["refresh_token"],
        )
    except HTTPException:
        logger.error(
            "Refusing insecure auth cookie settings in production | rid=%s user=%s secure=%s samesite=%s",
            request_id,
            str(user.get("_id") or ""),
            Config.JWT_COOKIE_SECURE,
            Config.JWT_COOKIE_SAMESITE,
        )
        raise
    response.delete_cookie(Config.JWT_MFA_CHALLENGE_COOKIE_NAME)

    await record_security_event(
        level="info",
        request_id=request_id,
        user_id=str(user.get("_id") or ""),
        endpoint="/api/login/mfa/verify",
        action="login_mfa_verified",
        detail="user completed MFA challenge and session issued",
        extra={"method": auth_method},
    )
    return {
        "message": "Login successful",
        "mfaRequired": False,
        "user": serialize_session_user(user),
    }

