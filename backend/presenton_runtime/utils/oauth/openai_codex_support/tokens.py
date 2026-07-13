from __future__ import annotations

import time

import httpx

from .constants import CLIENT_ID, REDIRECT_URI, TOKEN_URL
from .models import TokenFailure, TokenResult, TokenSuccess


def exchange_authorization_code(
    code: str,
    verifier: str,
    redirect_uri: str = REDIRECT_URI,
) -> TokenResult:
    try:
        response = httpx.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code",
                "client_id": CLIENT_ID,
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
            },
            timeout=30,
        )
        if not response.is_success:
            return TokenFailure(reason=f"HTTP {response.status_code}: {response.text[:200]}")

        body = response.json()
        access = body.get("access_token")
        refresh = body.get("refresh_token")
        expires_in = body.get("expires_in")

        if not access or not refresh or not isinstance(expires_in, (int, float)):
            return TokenFailure(reason=f"Token response missing fields: {list(body.keys())}")

        expires_ms = int(time.time() * 1000) + int(expires_in) * 1000
        id_token = body.get("id_token")
        id_token = id_token if isinstance(id_token, str) else None
        return TokenSuccess(access=access, refresh=refresh, expires=expires_ms, id_token=id_token)
    except Exception as exc:
        return TokenFailure(reason=str(exc))


def refresh_access_token(refresh_token: str) -> TokenResult:
    try:
        response = httpx.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": CLIENT_ID,
            },
            timeout=30,
        )
        if not response.is_success:
            return TokenFailure(reason=f"HTTP {response.status_code}: {response.text[:200]}")

        body = response.json()
        access = body.get("access_token")
        refresh = body.get("refresh_token")
        expires_in = body.get("expires_in")

        if not access or not refresh or not isinstance(expires_in, (int, float)):
            return TokenFailure(reason=f"Token refresh response missing fields: {list(body.keys())}")

        expires_ms = int(time.time() * 1000) + int(expires_in) * 1000
        return TokenSuccess(access=access, refresh=refresh, expires=expires_ms)
    except Exception as exc:
        return TokenFailure(reason=str(exc))


__all__ = ["exchange_authorization_code", "refresh_access_token"]
