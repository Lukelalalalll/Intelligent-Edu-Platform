from __future__ import annotations

from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.repositories import user_repo
from backend.schemas import PasswordResetConfirmSchema, PasswordResetRequestSchema
from backend.services.auth.auth_risk_service import (
    PASSWORD_RESET_SCOPE_IDENTIFIER,
    PASSWORD_RESET_SCOPE_IP,
    assert_not_locked,
    normalize_password_reset_identifier,
    password_reset_request_context,
    register_attempt,
)
from backend.services.auth.auth_session_service import revoke_all_sessions_for_user
from backend.services.auth.password_security_service import (
    ensure_password_strength,
    hash_password,
    hash_password_reset_token,
    issue_password_reset_token,
    utcnow,
)

from .account_validation import load_user_by_login_identifier
from .common import PASSWORD_RESET_TOKEN_TTL, as_utc


async def request_password_reset(payload: PasswordResetRequestSchema) -> dict:
    user_doc = await load_user_by_login_identifier(
        username=payload.username or "",
        email=payload.email or "",
    )
    response = {"message": "If the account exists, password reset instructions have been queued"}
    if not user_doc:
        return response

    raw_token, token_hash = issue_password_reset_token()
    reset_doc = {
        "user_id": str(user_doc["_id"]),
        "token_hash": token_hash,
        "expires_at": utcnow() + PASSWORD_RESET_TOKEN_TTL,
        "used_at": None,
        "created_at": utcnow(),
    }
    await db.password_reset_tokens.delete_many({"user_id": str(user_doc["_id"]), "used_at": None})
    await db.password_reset_tokens.insert_one(reset_doc)

    if Config.ENV.lower() not in ("production", "prod", "staging", "preprod"):
        response["dev_reset_token"] = raw_token
        response["reset_expires_at"] = reset_doc["expires_at"].isoformat()
    return response


async def request_password_reset_with_guards(
    payload: PasswordResetRequestSchema,
    *,
    request,
    request_password_reset_fn=None,
) -> dict:
    identifier = normalize_password_reset_identifier(
        username=payload.username,
        email=payload.email,
    )
    context = password_reset_request_context(request)
    ip_identifier = context["ip_identifier"]

    await assert_not_locked(
        scope=PASSWORD_RESET_SCOPE_IDENTIFIER,
        identifier=identifier,
        detail="Too many password reset attempts. Please try again later.",
    )
    await assert_not_locked(
        scope=PASSWORD_RESET_SCOPE_IP,
        identifier=ip_identifier,
        detail="Too many password reset attempts from this network. Please try again later.",
    )
    await register_attempt(
        scope=PASSWORD_RESET_SCOPE_IDENTIFIER,
        identifier=identifier,
        metadata={
            "ip_address": context["ip_address"],
            "user_agent": context["user_agent"],
            "channel": "password_reset",
        },
    )
    await register_attempt(
        scope=PASSWORD_RESET_SCOPE_IP,
        identifier=ip_identifier,
        metadata={
            "identifier_hash": identifier,
            "user_agent": context["user_agent"],
            "channel": "password_reset",
        },
    )
    reset_fn = request_password_reset_fn or request_password_reset
    return await reset_fn(payload)


async def confirm_password_reset(payload: PasswordResetConfirmSchema) -> None:
    reset_doc = await db.password_reset_tokens.find_one(
        {"token_hash": hash_password_reset_token(payload.token)}
    )
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = reset_doc.get("expires_at")
    used_at = reset_doc.get("used_at")
    if not expires_at or as_utc(expires_at) < utcnow() or used_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    account = await user_repo.find_by_id(reset_doc.get("user_id"))
    if not account:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    ensure_password_strength(
        payload.new_password,
        user_identifiers=[account.get("username", ""), account.get("email", "")],
    )
    password_hash, password_algo = hash_password(payload.new_password)
    await user_repo.update_by_id(
        account["_id"],
        {
            "$set": {
                "password_hash": password_hash,
                "password_algo": password_algo,
                "password_changed_at": utcnow(),
                "updated_at": utcnow(),
                "token_version": int(account.get("token_version") or 0) + 1,
            }
        },
    )
    await db.password_reset_tokens.update_one(
        {"_id": reset_doc["_id"]},
        {"$set": {"used_at": utcnow()}},
    )
    await db.password_reset_tokens.delete_many(
        {"user_id": str(account["_id"]), "_id": {"$ne": reset_doc["_id"]}},
    )
    await revoke_all_sessions_for_user(str(account["_id"]), reason="password-reset")
