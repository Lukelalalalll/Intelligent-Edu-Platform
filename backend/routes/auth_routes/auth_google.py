"""Google login endpoints and finalization flow."""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request, Response

from backend.config import Config
from backend.schemas import GoogleCompleteSchema, GoogleLinkSchema, GoogleLoginSchema
from backend.services.auth.auth_account_service import serialize_session_user
from backend.services.auth.auth_session_service import create_authenticated_session
from backend.services.auth.google_auth_service import complete_google_signup, link_google_account, start_google_login
from backend.services.auth.login_challenge_service import create_login_challenge

from .auth_cookies import _set_auth_cookies, _set_mfa_challenge_cookie
from .router import limiter
from fastapi import APIRouter
router = APIRouter()

logger = logging.getLogger(__name__)


async def _finalize_google_login(
    *,
    request: Request,
    response: Response,
    user: dict,
    primary_auth_method: str = "google",
) -> dict:
    if bool((user.get("mfa") or {}).get("enabled")):
        challenge = await create_login_challenge(
            user=user,
            request=request,
            primary_auth_method=primary_auth_method,
        )
        _set_mfa_challenge_cookie(response=response, challenge_id=challenge["challengeId"])
        return {
            "action": "mfa_required",
            "message": "MFA verification required",
            "mfaRequired": True,
            "challengeId": challenge["challengeId"],
            "method": challenge["method"],
            "expiresAt": challenge["expiresAt"],
        }

    session_bundle = await create_authenticated_session(
        user=user,
        request=request,
        amr=[primary_auth_method],
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
            getattr(request.state, "request_id", "unknown"),
            str(user.get("_id") or ""),
            Config.JWT_COOKIE_SECURE,
            Config.JWT_COOKIE_SAMESITE,
        )
        raise

    return {
        "action": "authenticated",
        "message": "Login successful",
        "mfaRequired": False,
        "user": serialize_session_user(user),
    }


@router.post("/login/google")
@limiter.limit("10/minute")
async def login_google(request: Request, req: GoogleLoginSchema, response: Response):
    result = await start_google_login(req.credential)
    if result.get("action") == "authenticated":
        return await _finalize_google_login(
            request=request,
            response=response,
            user=result["user"],
            primary_auth_method=str(result.get("primary_auth_method") or "google"),
        )
    return {"mfaRequired": False, **result}


@router.post("/login/google/link")
@limiter.limit("10/minute")
async def login_google_link(request: Request, req: GoogleLinkSchema, response: Response):
    user = await link_google_account(ticket_id=req.ticket_id, password=req.password)
    return await _finalize_google_login(
        request=request,
        response=response,
        user=user,
        primary_auth_method="google",
    )


@router.post("/login/google/complete")
@limiter.limit("10/minute")
async def login_google_complete(request: Request, req: GoogleCompleteSchema, response: Response):
    user = await complete_google_signup(
        ticket_id=req.ticket_id,
        username=req.username,
        staff_code=req.staff_code,
    )
    return await _finalize_google_login(
        request=request,
        response=response,
        user=user,
        primary_auth_method="google",
    )

