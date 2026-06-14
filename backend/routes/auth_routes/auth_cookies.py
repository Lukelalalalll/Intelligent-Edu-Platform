"""Cookie helpers for auth endpoints."""
from __future__ import annotations

import os
import secrets

from fastapi import HTTPException, Response

from backend.config import Config


def _set_csrf_cookie(response: Response) -> None:
    response.set_cookie(
        key=Config.JWT_CSRF_COOKIE_NAME,
        value=secrets.token_urlsafe(24),
        httponly=False,
        samesite=Config.JWT_COOKIE_SAMESITE,
        secure=Config.JWT_COOKIE_SECURE,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(Config.JWT_ACCESS_COOKIE_NAME)
    response.delete_cookie(Config.JWT_REFRESH_COOKIE_NAME)
    response.delete_cookie(Config.JWT_CSRF_COOKIE_NAME)
    response.delete_cookie(Config.JWT_MFA_CHALLENGE_COOKIE_NAME)


def _set_auth_cookies(*, response: Response, access_token: str, refresh_token: str) -> None:
    is_production = os.getenv("ENV", "development").lower() in ("production", "prod")
    samesite = Config.JWT_COOKIE_SAMESITE
    secure_cookie = Config.JWT_COOKIE_SECURE

    if is_production and (not secure_cookie or samesite == "none" and not secure_cookie):
        raise HTTPException(status_code=500, detail="Server authentication cookie policy is misconfigured")

    response.set_cookie(
        key=Config.JWT_ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        samesite=samesite,
        secure=secure_cookie if is_production else bool(secure_cookie),
        max_age=int(Config.JWT_ACCESS_TOKEN_EXPIRES.total_seconds()),
    )
    response.set_cookie(
        key=Config.JWT_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite=samesite,
        secure=secure_cookie if is_production else bool(secure_cookie),
        max_age=int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds()),
    )
    _set_csrf_cookie(response)


def _set_mfa_challenge_cookie(*, response: Response, challenge_id: str) -> None:
    response.set_cookie(
        key=Config.JWT_MFA_CHALLENGE_COOKIE_NAME,
        value=challenge_id,
        httponly=True,
        samesite=Config.JWT_COOKIE_SAMESITE,
        secure=Config.JWT_COOKIE_SECURE,
        max_age=300,
    )
