from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request
from jose import JWTError, jwt

from backend.config import Config
from backend.repositories import session_repo, user_repo
from backend.services.auth.mfa_security_service import step_up_expires_at
from backend.services.auth.password_security_service import utcnow

_ACCESS_ISSUER = "intelligent-edu-platform"
_ACCESS_AUDIENCE = "intelligent-edu-web"
_REFRESH_AUDIENCE = "intelligent-edu-refresh"
_REFRESH_HASH_SALT = "refresh-token-hash-v1"


def _dt_to_ts(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return int(value.timestamp())


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(f"{_REFRESH_HASH_SALT}:{token}".encode("utf-8")).hexdigest()


def _hash_value(value: str) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def _user_agent_hash(request: Request) -> str:
    return _hash_value(request.headers.get("user-agent", "")[:512])


def _ip_hash(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else ""
    if not candidate:
        candidate = getattr(request.client, "host", "") or ""
    return _hash_value(candidate)


def _masked_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else ""
    if not candidate:
        candidate = getattr(request.client, "host", "") or ""
    if "." in candidate:
        parts = candidate.split(".")
        if len(parts) == 4:
            return ".".join(parts[:3] + ["*"])
    if ":" in candidate:
        parts = candidate.split(":")
        return ":".join(parts[:4] + ["*"])
    return candidate[:16]


def _detect_browser(user_agent: str) -> str:
    ua = user_agent.lower()
    if "edg/" in ua:
        return "Edge"
    if "chrome/" in ua and "edg/" not in ua:
        return "Chrome"
    if "firefox/" in ua:
        return "Firefox"
    if "safari/" in ua and "chrome/" not in ua:
        return "Safari"
    return "Unknown browser"


def _detect_os(user_agent: str) -> str:
    ua = user_agent.lower()
    if "windows" in ua:
        return "Windows"
    if "iphone" in ua or "ipad" in ua or "ios" in ua:
        return "iOS"
    if "android" in ua:
        return "Android"
    if "mac os x" in ua or "macintosh" in ua:
        return "macOS"
    if "linux" in ua:
        return "Linux"
    return "Unknown OS"


def _detect_device_type(user_agent: str) -> str:
    ua = user_agent.lower()
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "iphone" in ua or "android" in ua or "mobile" in ua:
        return "mobile"
    return "desktop"


def _device_snapshot(request: Request) -> dict[str, str]:
    user_agent = request.headers.get("user-agent", "")[:512]
    browser = _detect_browser(user_agent)
    os_name = _detect_os(user_agent)
    device_type = _detect_device_type(user_agent)
    return {
        "user_agent": user_agent,
        "browser": browser,
        "os": os_name,
        "device_type": device_type,
        "device_label": f"{browser} on {os_name}",
        "ip_label": _masked_ip(request),
    }


def _same_fingerprint(left: dict[str, Any], *, request: Request) -> bool:
    return hmac.compare_digest(str(left.get("ua_hash") or ""), _user_agent_hash(request)) and hmac.compare_digest(
        str(left.get("ip_hash") or ""), _ip_hash(request)
    )


def create_access_token(data: dict[str, Any]) -> str:
    now = utcnow()
    expire = now + Config.JWT_ACCESS_TOKEN_EXPIRES
    payload = data.copy()
    payload.setdefault("iat", _dt_to_ts(now))
    payload.setdefault("iss", _ACCESS_ISSUER)
    payload.setdefault("aud", _ACCESS_AUDIENCE)
    payload.setdefault("jti", secrets.token_urlsafe(16))
    payload["exp"] = _dt_to_ts(expire)
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
        "iat": _dt_to_ts(now),
        "iss": _ACCESS_ISSUER,
        "aud": _REFRESH_AUDIENCE,
        "jti": refresh_jti,
        "exp": _dt_to_ts(expire),
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


def _serialize_session(doc: dict[str, Any], *, current_session_id: str | None = None) -> dict[str, Any]:
    return {
        "sessionId": str(doc.get("session_id") or ""),
        "createdAt": doc.get("created_at").isoformat() if doc.get("created_at") else None,
        "lastSeenAt": doc.get("last_seen_at").isoformat() if doc.get("last_seen_at") else None,
        "lastRotatedAt": doc.get("last_rotated_at").isoformat() if doc.get("last_rotated_at") else None,
        "expiresAt": doc.get("expires_at").isoformat() if doc.get("expires_at") else None,
        "stepUpExpiresAt": doc.get("step_up_expires_at").isoformat() if doc.get("step_up_expires_at") else None,
        "current": str(doc.get("session_id") or "") == str(current_session_id or ""),
        "amr": list(doc.get("amr") or []),
        "deviceLabel": doc.get("device_label") or "Unknown device",
        "browser": doc.get("browser") or "Unknown browser",
        "os": doc.get("os") or "Unknown OS",
        "deviceType": doc.get("device_type") or "desktop",
        "ipLabel": doc.get("ip_label") or "",
    }


async def create_authenticated_session(
    *,
    user: dict[str, Any],
    request: Request,
    amr: list[str] | None = None,
) -> dict[str, Any]:
    now = utcnow()
    session_id = uuid4().hex
    family_id = uuid4().hex
    session_amr = list(amr or ["pwd"])
    mfa_completed = any(item in {"otp", "backup_code"} for item in session_amr)
    device = _device_snapshot(request)
    step_up_expiry = step_up_expires_at() if mfa_completed else None
    refresh_token, refresh_jti = create_refresh_token(
        user_id=str(user["_id"]),
        session_id=session_id,
        family_id=family_id,
        token_version=int(user.get("token_version") or 0),
    )
    access_token = create_access_token(
        {
            "sub": str(user["_id"]),
            "sid": session_id,
            "token_version": int(user.get("token_version") or 0),
            "role": user.get("role", "student"),
            "amr": session_amr,
            "mfa": mfa_completed,
        }
    )
    expires_at = now + Config.JWT_REFRESH_TOKEN_EXPIRES

    await session_repo.insert_session(
        {
            "session_id": session_id,
            "user_id": str(user["_id"]),
            "family_id": family_id,
            "refresh_token_hash": hash_refresh_token(refresh_token),
            "refresh_jti": refresh_jti,
            "token_version": int(user.get("token_version") or 0),
            "created_at": now,
            "updated_at": now,
            "last_seen_at": now,
            "last_rotated_at": now,
            "expires_at": expires_at,
            "revoked_at": None,
            "revoked_reason": None,
            "ua_hash": _user_agent_hash(request),
            "ip_hash": _ip_hash(request),
            "amr": session_amr,
            "mfa_verified_at": now if mfa_completed else None,
            "step_up_verified_at": now if mfa_completed else None,
            "step_up_expires_at": step_up_expiry,
            **device,
        }
    )

    return {
        "session_id": session_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
    }


async def touch_session(session_id: str) -> None:
    now = utcnow()
    await session_repo.update_by_session_id(
        session_id,
        {"$set": {"last_seen_at": now, "updated_at": now}},
    )


async def get_active_session_for_access(*, session_id: str, user_id: str, token_version: int) -> dict[str, Any]:
    session = await session_repo.find_by_session_id(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    if str(session.get("user_id") or "") != str(user_id):
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    if session.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    expires_at = session.get("expires_at")
    if expires_at and expires_at <= utcnow():
        raise HTTPException(status_code=401, detail="Session expired")
    if int(session.get("token_version") or 0) != int(token_version or 0):
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    await touch_session(session_id)
    return session


async def rotate_refresh_session(*, refresh_token: str, request: Request) -> dict[str, Any]:
    try:
        payload = decode_refresh_token(refresh_token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Refresh token expired") from exc

    user_id = str(payload.get("sub") or "")
    session_id = str(payload.get("sid") or "")
    family_id = str(payload.get("family_id") or "")
    refresh_jti = str(payload.get("jti") or "")
    token_version = int(payload.get("token_version") or 0)
    refresh_token_hash = hash_refresh_token(refresh_token)

    session = await session_repo.find_by_session_id(session_id)
    if not session or session.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    if str(session.get("user_id") or "") != user_id or str(session.get("family_id") or "") != family_id:
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    if int(session.get("token_version") or 0) != token_version:
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    expires_at = session.get("expires_at")
    if expires_at and expires_at <= utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    if not hmac.compare_digest(str(session.get("refresh_jti") or ""), refresh_jti):
        await session_repo.revoke_family(family_id, utcnow(), "refresh-replay-detected")
        raise HTTPException(status_code=401, detail="Refresh token replay detected")
    if not hmac.compare_digest(str(session.get("refresh_token_hash") or ""), refresh_token_hash):
        await session_repo.revoke_family(family_id, utcnow(), "refresh-replay-detected")
        raise HTTPException(status_code=401, detail="Refresh token replay detected")
    if not _same_fingerprint(session, request=request):
        await session_repo.revoke_family(family_id, utcnow(), "refresh-fingerprint-mismatch")
        raise HTTPException(status_code=401, detail="Session fingerprint mismatch")

    user = await user_repo.find_by_id(user_id)
    if not user:
        await session_repo.revoke_family(family_id, utcnow(), "user-missing")
        raise HTTPException(status_code=401, detail="User not found")
    if int(user.get("token_version") or 0) != token_version:
        await session_repo.revoke_all_for_user(user_id, utcnow(), "token-version-changed")
        raise HTTPException(status_code=401, detail="Session is no longer valid")

    session_amr = list(session.get("amr") or ["pwd"])
    new_refresh_token, new_refresh_jti = create_refresh_token(
        user_id=user_id,
        session_id=session_id,
        family_id=family_id,
        token_version=token_version,
    )
    access_token = create_access_token(
        {
            "sub": user_id,
            "sid": session_id,
            "token_version": token_version,
            "role": user.get("role", "student"),
            "amr": session_amr,
            "mfa": any(item in {"otp", "backup_code"} for item in session_amr),
        }
    )

    now = utcnow()
    expires_at = now + Config.JWT_REFRESH_TOKEN_EXPIRES
    device = _device_snapshot(request)
    await session_repo.update_by_session_id(
        session_id,
        {
            "$set": {
                "refresh_token_hash": hash_refresh_token(new_refresh_token),
                "refresh_jti": new_refresh_jti,
                "last_seen_at": now,
                "last_rotated_at": now,
                "updated_at": now,
                "expires_at": expires_at,
                "ua_hash": _user_agent_hash(request),
                "ip_hash": _ip_hash(request),
                **device,
            }
        },
    )

    return {
        "user": user,
        "session_id": session_id,
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "expires_at": expires_at,
    }


async def revoke_current_session(session_id: str, *, reason: str) -> None:
    await session_repo.revoke_session(session_id, utcnow(), reason)


async def revoke_all_sessions_for_user(user_id: str, *, reason: str) -> None:
    await session_repo.revoke_all_for_user(user_id, utcnow(), reason)


async def list_user_sessions(*, user_id: str, current_session_id: str | None = None) -> list[dict[str, Any]]:
    sessions = await session_repo.list_active_for_user(
        user_id,
        {
            "_id": 0,
            "session_id": 1,
            "created_at": 1,
            "last_seen_at": 1,
            "last_rotated_at": 1,
            "expires_at": 1,
            "step_up_expires_at": 1,
            "amr": 1,
            "device_label": 1,
            "browser": 1,
            "os": 1,
            "device_type": 1,
            "ip_label": 1,
        },
    )
    return [_serialize_session(doc, current_session_id=current_session_id) for doc in sessions]


async def revoke_user_session(*, user_id: str, session_id: str) -> None:
    target = await session_repo.find_by_session_id(session_id, {"user_id": 1, "session_id": 1})
    if not target or str(target.get("user_id") or "") != str(user_id):
        raise HTTPException(status_code=404, detail="Session not found")
    await session_repo.revoke_session(session_id, utcnow(), "user-initiated")


async def mark_session_step_up(session_id: str, *, method: str) -> dict[str, Any]:
    now = utcnow()
    expires_at = step_up_expires_at()
    session = await session_repo.find_by_session_id(session_id, {"amr": 1})
    amr = list((session or {}).get("amr") or [])
    if method and method not in amr:
        amr.append(method)
    await session_repo.update_by_session_id(
        session_id,
        {
            "$set": {
                "step_up_verified_at": now,
                "step_up_expires_at": expires_at,
                "last_seen_at": now,
                "updated_at": now,
                "amr": amr,
            }
        },
    )
    return {"verifiedAt": now, "expiresAt": expires_at, "amr": amr}

