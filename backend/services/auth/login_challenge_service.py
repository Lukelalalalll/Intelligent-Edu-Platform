from __future__ import annotations

import hashlib
from datetime import timedelta
from uuid import uuid4

from fastapi import HTTPException, Request

from backend.repositories import login_challenge_repo, user_repo
from backend.services.auth.mfa_security_service import (
    consume_backup_code,
    decrypt_mfa_secret,
    normalize_mfa_code,
    verify_totp_code,
)
from backend.services.auth.password_security_service import utcnow

LOGIN_CHALLENGE_TTL = timedelta(minutes=5)
LOGIN_CHALLENGE_MAX_ATTEMPTS = 5


def _request_user_agent_hash(request: Request) -> str:
    return hashlib.sha256(request.headers.get("user-agent", "")[:512].encode("utf-8")).hexdigest()


async def create_login_challenge(*, user: dict, request: Request, primary_auth_method: str = "pwd") -> dict:
    now = utcnow()
    challenge_id = uuid4().hex
    await login_challenge_repo.insert_challenge(
        {
            "challenge_id": challenge_id,
            "user_id": str(user["_id"]),
            "created_at": now,
            "expires_at": now + LOGIN_CHALLENGE_TTL,
            "completed_at": None,
            "attempts": 0,
            "ua_hash": _request_user_agent_hash(request),
            "primary_auth_method": primary_auth_method,
        }
    )
    return {
        "challengeId": challenge_id,
        "method": "totp",
        "expiresAt": (now + LOGIN_CHALLENGE_TTL).isoformat(),
    }


async def verify_login_challenge(*, challenge_id: str, code: str, request: Request) -> dict:
    challenge = await login_challenge_repo.find_by_challenge_id(challenge_id)
    if not challenge:
        raise HTTPException(status_code=401, detail="MFA challenge not found")
    if challenge.get("completed_at"):
        raise HTTPException(status_code=401, detail="MFA challenge already used")
    if challenge.get("expires_at") and challenge["expires_at"] <= utcnow():
        raise HTTPException(status_code=401, detail="MFA challenge expired")
    if int(challenge.get("attempts") or 0) >= LOGIN_CHALLENGE_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many MFA attempts")
    if challenge.get("ua_hash") and challenge.get("ua_hash") != _request_user_agent_hash(request):
        raise HTTPException(status_code=401, detail="MFA challenge context mismatch")

    user = await user_repo.find_by_id(challenge.get("user_id"))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    mfa_doc = dict(user.get("mfa") or {})
    if not mfa_doc.get("enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account")

    normalized_code = normalize_mfa_code(code)
    totp_secret = decrypt_mfa_secret(mfa_doc.get("totp_secret_encrypted"))
    verified = bool(totp_secret and verify_totp_code(totp_secret, normalized_code))
    auth_method = "otp"
    update_user = None
    if not verified:
        verified, updated_codes = consume_backup_code(mfa_doc.get("backup_codes"), normalized_code)
        if verified:
            auth_method = "backup_code"
            update_user = updated_codes

    if not verified:
        await login_challenge_repo.update_by_challenge_id(
            challenge_id,
            {"$inc": {"attempts": 1}, "$set": {"updated_at": utcnow()}},
        )
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    now = utcnow()
    await login_challenge_repo.update_by_challenge_id(
        challenge_id,
        {"$set": {"completed_at": now, "updated_at": now, "auth_method": auth_method}},
    )
    if update_user is not None:
        await user_repo.update_by_id(user["_id"], {"$set": {"mfa.backup_codes": update_user, "updated_at": now}})
        user.setdefault("mfa", {})["backup_codes"] = update_user
    return {
        "user": user,
        "auth_method": auth_method,
        "primary_auth_method": str(challenge.get("primary_auth_method") or "pwd"),
    }

