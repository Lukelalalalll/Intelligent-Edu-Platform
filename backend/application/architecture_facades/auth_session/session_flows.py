from __future__ import annotations

import hmac
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request
from jose import JWTError

from backend.config import Config
from backend.repositories import session_repo, user_repo
from backend.services.auth.mfa_security_service import step_up_expires_at
from backend.services.auth.password_security_service import utcnow

from .fingerprint import device_snapshot, ip_hash, same_fingerprint, user_agent_hash
from .session_views import serialize_session
from .token_codec import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_refresh_token,
)


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
    device = device_snapshot(request)
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
            "ua_hash": user_agent_hash(request),
            "ip_hash": ip_hash(request),
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
    await session_repo.update_by_session_id(session_id, {"$set": {"last_seen_at": now, "updated_at": now}})


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
    if not same_fingerprint(session, request=request):
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
    device = device_snapshot(request)
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
                "ua_hash": user_agent_hash(request),
                "ip_hash": ip_hash(request),
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
    return [serialize_session(doc, current_session_id=current_session_id) for doc in sessions]


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
