from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Any

from jose import JWTError, jwt

from backend.config import Config
from backend.services.auth.password_security_service import utcnow

_ACCESS_ISSUER = "intelligent-edu-platform"
_ACCESS_AUDIENCE = "intelligent-edu-web"
_REFRESH_AUDIENCE = "intelligent-edu-refresh"
_REFRESH_HASH_SALT = "refresh-token-hash-v1"


def dt_to_timestamp(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return int(value.timestamp())


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(f"{_REFRESH_HASH_SALT}:{token}".encode("utf-8")).hexdigest()


def create_access_token(data: dict[str, Any]) -> str:
    now = utcnow()
    expire = now + Config.JWT_ACCESS_TOKEN_EXPIRES
    payload = data.copy()
    payload.setdefault("iat", dt_to_timestamp(now))
    payload.setdefault("iss", _ACCESS_ISSUER)
    payload.setdefault("aud", _ACCESS_AUDIENCE)
    payload.setdefault("jti", secrets.token_urlsafe(16))
    payload["exp"] = dt_to_timestamp(expire)
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")


def create_refresh_token(
    *,
    user_id: str,
    session_id: str,
    family_id: str,
    token_version: int,
    jti: str | None = None,
) -> tuple[str, str]:
    now = utcnow()
    expire = now + Config.JWT_REFRESH_TOKEN_EXPIRES
    refresh_jti = jti or secrets.token_urlsafe(24)
    payload = {
        "sub": user_id,
        "sid": session_id,
        "family_id": family_id,
        "token_version": int(token_version or 0),
        "iat": dt_to_timestamp(now),
        "iss": _ACCESS_ISSUER,
        "aud": _REFRESH_AUDIENCE,
        "jti": refresh_jti,
        "exp": dt_to_timestamp(expire),
        "typ": "refresh",
    }
    token = jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")
    return token, refresh_jti


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        Config.JWT_SECRET_KEY,
        algorithms=["HS256"],
        audience=_ACCESS_AUDIENCE,
        issuer=_ACCESS_ISSUER,
    )


def decode_refresh_token(token: str) -> dict[str, Any]:
    payload = jwt.decode(
        token,
        Config.JWT_SECRET_KEY,
        algorithms=["HS256"],
        audience=_REFRESH_AUDIENCE,
        issuer=_ACCESS_ISSUER,
    )
    if payload.get("typ") != "refresh":
        raise JWTError("Invalid token type")
    return payload
