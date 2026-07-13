from __future__ import annotations

from fastapi import HTTPException

from backend.repositories import user_repo
from backend.services.auth.auth_risk_service import (
    LOGIN_SCOPE_IP,
    LOGIN_SCOPE_PRINCIPAL,
    assert_not_locked,
    clear_attempt_state,
    login_request_context,
    normalize_login_principal,
    register_failure,
)
from backend.services.auth.password_security_service import (
    hash_password,
    normalize_email,
    normalize_username,
    password_needs_rehash,
    utcnow,
    verify_password,
)


async def authenticate_user(username: str, password: str) -> dict | None:
    user_doc = await user_repo.find_by_username_normalized(normalize_username(username))
    if user_doc is None:
        user_doc = await user_repo.find_by_username(username.strip())
    if not user_doc or not verify_password(password, user_doc.get("password_hash", "")):
        return None

    normalized_username = normalize_username(user_doc.get("username", username))
    normalized_email = normalize_email(user_doc.get("email", ""))
    refresh_fields: dict[str, object] = {}
    if user_doc.get("username_normalized") != normalized_username:
        refresh_fields["username_normalized"] = normalized_username
        user_doc["username_normalized"] = normalized_username
    if user_doc.get("email_normalized") != normalized_email:
        refresh_fields["email_normalized"] = normalized_email
        user_doc["email_normalized"] = normalized_email

    if password_needs_rehash(user_doc.get("password_hash", "")):
        password_hash, password_algo = hash_password(password)
        refresh_fields.update(
            {
                "password_hash": password_hash,
                "password_algo": password_algo,
                "password_changed_at": utcnow(),
            }
        )
        user_doc["password_hash"] = password_hash
        user_doc["password_algo"] = password_algo

    if refresh_fields:
        refresh_fields["updated_at"] = utcnow()
        await user_repo.update_by_id(user_doc["_id"], {"$set": refresh_fields})
    return user_doc


async def authenticate_user_with_guards(
    username: str,
    password: str,
    *,
    request,
    authenticate_fn=None,
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

    auth_fn = authenticate_fn or authenticate_user
    user_doc = await auth_fn(username, password)
    if user_doc and str(user_doc.get("status") or "active").lower() != "active":
        raise HTTPException(status_code=403, detail="Account is not allowed to sign in")

    if user_doc:
        await clear_attempt_state(scope=LOGIN_SCOPE_PRINCIPAL, identifier=principal_identifier)
        await clear_attempt_state(scope=LOGIN_SCOPE_IP, identifier=ip_identifier)
        return user_doc

    await register_failure(
        scope=LOGIN_SCOPE_PRINCIPAL,
        identifier=principal_identifier,
        metadata={
            "ip_address": context["ip_address"],
            "user_agent": context["user_agent"],
            "channel": "login",
        },
    )
    await register_failure(
        scope=LOGIN_SCOPE_IP,
        identifier=ip_identifier,
        metadata={
            "principal_hash": principal_identifier,
            "user_agent": context["user_agent"],
            "channel": "login",
        },
    )
    return None
