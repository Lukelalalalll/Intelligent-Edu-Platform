from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from backend.config import Config
from backend.core.database import db
from backend.repositories import staff_code_repo, user_repo
from backend.schemas import (
    AuthSchema,
    PasswordResetConfirmSchema,
    PasswordResetRequestSchema,
    SelfUpdateProfileSchema,
)
from backend.services.auth.password_security_service import (
    ensure_password_strength,
    hash_password,
    hash_password_reset_token,
    issue_password_reset_token,
    normalize_email,
    normalize_username,
    password_needs_rehash,
    utcnow,
    verify_password,
)
from backend.services.auth.auth_session_service import revoke_all_sessions_for_user
from backend.services.auth.auth_risk_service import (
    LOGIN_SCOPE_IP,
    LOGIN_SCOPE_PRINCIPAL,
    PASSWORD_RESET_SCOPE_IDENTIFIER,
    PASSWORD_RESET_SCOPE_IP,
    assert_not_locked,
    clear_attempt_state,
    login_request_context,
    normalize_login_principal,
    normalize_password_reset_identifier,
    password_reset_request_context,
    register_attempt,
    register_failure,
)

PASSWORD_RESET_TOKEN_TTL = timedelta(minutes=30)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def serialize_session_user(user_doc: dict) -> dict:
    google_auth = dict(user_doc.get("google_auth") or {})
    return {
        "id": str(user_doc.get("_id") or ""),
        "username": user_doc.get("username"),
        "email": user_doc.get("email"),
        "role": user_doc.get("role", "student"),
        "teacherCourseIds": user_doc.get("teacherCourseIds", []),
        "avatarUrl": google_auth.get("picture"),
        "googleLinked": bool(google_auth.get("sub")),
    }


async def register_user(payload: AuthSchema) -> None:
    normalized_username = normalize_username(payload.username)
    normalized_email = normalize_email(payload.email or "")
    ensure_password_strength(payload.password, user_identifiers=[payload.username, payload.email or ""])

    existing_username = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
    if existing_username is None:
        existing_username = await user_repo.find_by_username(payload.username.strip(), {"_id": 1})
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already exists")
    existing_email = None
    if normalized_email:
        existing_email = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email is None:
            existing_email = await user_repo.find_by_email((payload.email or "").strip(), {"_id": 1})
    if existing_email:
        raise HTTPException(status_code=409, detail="Email already exists")

    role = "student"
    active_code: dict | None = None
    if payload.staff_code:
        code = payload.staff_code.strip().upper()
        active_code = await staff_code_repo.find_active_code(code)
        if not active_code:
            raise HTTPException(status_code=400, detail="Invalid or already-used staff code")
        if _as_utc(active_code["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Staff code has expired")
        role = "teacher"

    password_hash, password_algo = hash_password(payload.password)
    result = await user_repo.insert_user(
        {
            "username": payload.username.strip(),
            "username_normalized": normalized_username,
            "email": (payload.email or "").strip(),
            "email_normalized": normalized_email,
            "password_hash": password_hash,
            "password_algo": password_algo,
            "password_changed_at": utcnow(),
            "role": role,
            "teacherCourseIds": [],
            "token_version": 1,
            "status": "active",
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )

    if active_code:
        await staff_code_repo.mark_code_used(
            active_code["code"],
            used_by=str(result.inserted_id),
            used_at=datetime.now(timezone.utc),
        )


async def request_password_reset(payload: PasswordResetRequestSchema) -> dict:
    identifier_email = normalize_email(payload.email or "")
    identifier_username = normalize_username(payload.username or "")
    user_doc = None

    if identifier_email:
        user_doc = await user_repo.find_by_email_normalized(identifier_email)
        if user_doc is None and payload.email:
            user_doc = await user_repo.find_by_email(payload.email.strip())
    if user_doc is None and identifier_username:
        user_doc = await user_repo.find_by_username_normalized(identifier_username)
        if user_doc is None and payload.username:
            user_doc = await user_repo.find_by_username(payload.username.strip())

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
) -> dict:
    identifier = normalize_password_reset_identifier(username=payload.username, email=payload.email)
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
        metadata={"ip_address": context["ip_address"], "user_agent": context["user_agent"], "channel": "password_reset"},
    )
    await register_attempt(
        scope=PASSWORD_RESET_SCOPE_IP,
        identifier=ip_identifier,
        metadata={"identifier_hash": identifier, "user_agent": context["user_agent"], "channel": "password_reset"},
    )

    return await request_password_reset(payload)


async def confirm_password_reset(payload: PasswordResetConfirmSchema) -> None:
    hashed_token = hash_password_reset_token(payload.token)
    reset_doc = await db.password_reset_tokens.find_one({"token_hash": hashed_token})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = reset_doc.get("expires_at")
    used_at = reset_doc.get("used_at")
    if not expires_at or _as_utc(expires_at) < utcnow() or used_at:
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


async def authenticate_user(username: str, password: str) -> dict | None:
    user_doc = await user_repo.find_by_username_normalized(normalize_username(username))
    if user_doc is None:
        user_doc = await user_repo.find_by_username(username.strip())
    if not user_doc or not verify_password(password, user_doc.get("password_hash", "")):
        return None

    normalized_username = normalize_username(user_doc.get("username", username))
    normalized_email = normalize_email(user_doc.get("email", ""))
    refresh_account_fields: dict[str, object] = {}
    if user_doc.get("username_normalized") != normalized_username:
        refresh_account_fields["username_normalized"] = normalized_username
        user_doc["username_normalized"] = normalized_username
    if user_doc.get("email_normalized") != normalized_email:
        refresh_account_fields["email_normalized"] = normalized_email
        user_doc["email_normalized"] = normalized_email

    if password_needs_rehash(user_doc.get("password_hash", "")):
        password_hash, password_algo = hash_password(password)
        refresh_account_fields.update(
            {
                "password_hash": password_hash,
                "password_algo": password_algo,
                "password_changed_at": utcnow(),
            }
        )
        user_doc["password_hash"] = password_hash
        user_doc["password_algo"] = password_algo

    if refresh_account_fields:
        refresh_account_fields["updated_at"] = utcnow()
        await user_repo.update_by_id(user_doc["_id"], {"$set": refresh_account_fields})
    return user_doc


async def authenticate_user_with_guards(
    username: str,
    password: str,
    *,
    request,
) -> dict | None:
    principal_identifier = normalize_login_principal(username)
    context = login_request_context(request)
    ip_identifier = context["ip_identifier"]

    await assert_not_locked(
        scope=LOGIN_SCOPE_PRINCIPAL,
        identifier=principal_identifier,
        detail="Account temporarily locked due to repeated login failures. Please try again later.",
    )
    await assert_not_locked(
        scope=LOGIN_SCOPE_IP,
        identifier=ip_identifier,
        detail="Too many failed login attempts from this network. Please try again later.",
    )

    user_doc = await authenticate_user(username, password)
    if user_doc and str(user_doc.get("status") or "active").lower() != "active":
        raise HTTPException(status_code=403, detail="Account is not allowed to sign in")

    if user_doc:
        await clear_attempt_state(scope=LOGIN_SCOPE_PRINCIPAL, identifier=principal_identifier)
        await clear_attempt_state(scope=LOGIN_SCOPE_IP, identifier=ip_identifier)
        return user_doc

    await register_failure(
        scope=LOGIN_SCOPE_PRINCIPAL,
        identifier=principal_identifier,
        metadata={"ip_address": context["ip_address"], "user_agent": context["user_agent"], "channel": "login"},
    )
    await register_failure(
        scope=LOGIN_SCOPE_IP,
        identifier=ip_identifier,
        metadata={"principal_hash": principal_identifier, "user_agent": context["user_agent"], "channel": "login"},
    )
    return None


async def update_current_profile(*, current_user: dict, payload: SelfUpdateProfileSchema) -> None:
    if not verify_password(payload.current_password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    update_data: dict[str, object] = {}
    normalized_username = normalize_username(payload.username or current_user.get("username", ""))
    normalized_email = normalize_email(payload.email or current_user.get("email", ""))

    if payload.username:
        existing_user = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
        if existing_user is None:
            existing_user = await user_repo.find_by_username(payload.username.strip(), {"_id": 1})
        if existing_user and str(existing_user["_id"]) != str(current_user["_id"]):
            raise HTTPException(status_code=409, detail="Username already exists")
        update_data["username"] = payload.username.strip()
        update_data["username_normalized"] = normalized_username
    if payload.email:
        existing_email_user = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email_user is None:
            existing_email_user = await user_repo.find_by_email(payload.email.strip(), {"_id": 1})
        if existing_email_user and str(existing_email_user["_id"]) != str(current_user["_id"]):
            raise HTTPException(status_code=409, detail="Email already exists")
        update_data["email"] = payload.email.strip()
        update_data["email_normalized"] = normalized_email
    if payload.password:
        ensure_password_strength(
            payload.password,
            user_identifiers=[payload.username or current_user.get("username", ""), payload.email or current_user.get("email", "")],
        )
        password_hash, password_algo = hash_password(payload.password)
        update_data["password_hash"] = password_hash
        update_data["password_algo"] = password_algo
        update_data["password_changed_at"] = utcnow()
        update_data["token_version"] = int(current_user.get("token_version") or 0) + 1

    if not update_data:
        return

    update_data["updated_at"] = utcnow()
    await user_repo.update_by_id(current_user["_id"], {"$set": update_data})
    current_user.update(update_data)
    if payload.password:
        await revoke_all_sessions_for_user(str(current_user["_id"]), reason="password-changed")

