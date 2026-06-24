from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from backend.repositories import staff_code_repo, user_repo
from backend.services.auth.password_security_service import (
    normalize_email,
    normalize_username,
)

from .common import as_utc


async def ensure_unique_registration_identifiers(*, username: str, email: str) -> tuple[str, str]:
    normalized_username = normalize_username(username)
    normalized_email = normalize_email(email or "")

    existing_username = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
    if existing_username is None:
        existing_username = await user_repo.find_by_username(username.strip(), {"_id": 1})
    if existing_username:
        raise HTTPException(status_code=409, detail="Username already exists")

    if normalized_email:
        existing_email = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email is None:
            existing_email = await user_repo.find_by_email(email.strip(), {"_id": 1})
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already exists")

    return normalized_username, normalized_email


async def resolve_staff_role(staff_code: str | None) -> tuple[str, dict | None]:
    if not staff_code:
        return "student", None

    active_code = await staff_code_repo.find_active_code(staff_code.strip().upper())
    if not active_code:
        raise HTTPException(status_code=400, detail="Invalid or already-used staff code")
    if as_utc(active_code["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Staff code has expired")
    return "teacher", active_code


async def load_user_by_login_identifier(*, username: str = "", email: str = "") -> dict | None:
    normalized_email = normalize_email(email or "")
    normalized_username = normalize_username(username or "")
    user_doc = None

    if normalized_email:
        user_doc = await user_repo.find_by_email_normalized(normalized_email)
        if user_doc is None and email:
            user_doc = await user_repo.find_by_email(email.strip())
    if user_doc is None and normalized_username:
        user_doc = await user_repo.find_by_username_normalized(normalized_username)
        if user_doc is None and username:
            user_doc = await user_repo.find_by_username(username.strip())
    return user_doc


async def ensure_profile_update_is_unique(
    *,
    current_user: dict,
    username: str | None,
    email: str | None,
) -> tuple[dict[str, object], str, str]:
    normalized_username = normalize_username(username or current_user.get("username", ""))
    normalized_email = normalize_email(email or current_user.get("email", ""))
    update_data: dict[str, object] = {}

    if username:
        existing_user = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
        if existing_user is None:
            existing_user = await user_repo.find_by_username(username.strip(), {"_id": 1})
        if existing_user and str(existing_user["_id"]) != str(current_user["_id"]):
            raise HTTPException(status_code=409, detail="Username already exists")
        update_data["username"] = username.strip()
        update_data["username_normalized"] = normalized_username

    if email:
        existing_email_user = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email_user is None:
            existing_email_user = await user_repo.find_by_email(email.strip(), {"_id": 1})
        if existing_email_user and str(existing_email_user["_id"]) != str(current_user["_id"]):
            raise HTTPException(status_code=409, detail="Email already exists")
        update_data["email"] = email.strip()
        update_data["email_normalized"] = normalized_email

    return update_data, normalized_username, normalized_email
