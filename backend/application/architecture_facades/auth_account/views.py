from __future__ import annotations

from fastapi import HTTPException

from backend.repositories import user_repo
from backend.schemas import SelfUpdateProfileSchema
from backend.services.auth.auth_session_service import revoke_all_sessions_for_user
from backend.services.auth.password_security_service import (
    ensure_password_strength,
    hash_password,
    utcnow,
    verify_password,
)

from .account_validation import ensure_profile_update_is_unique


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


async def update_current_profile(
    *,
    current_user: dict,
    payload: SelfUpdateProfileSchema,
) -> None:
    if not verify_password(payload.current_password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    update_data, normalized_username, normalized_email = await ensure_profile_update_is_unique(
        current_user=current_user,
        username=payload.username,
        email=payload.email,
    )

    if payload.password:
        ensure_password_strength(
            payload.password,
            user_identifiers=[
                payload.username or current_user.get("username", ""),
                payload.email or current_user.get("email", ""),
            ],
        )
        password_hash, password_algo = hash_password(payload.password)
        update_data["password_hash"] = password_hash
        update_data["password_algo"] = password_algo
        update_data["password_changed_at"] = utcnow()
        update_data["token_version"] = int(current_user.get("token_version") or 0) + 1

    if payload.username and "username_normalized" not in update_data:
        update_data["username_normalized"] = normalized_username
    if payload.email and "email_normalized" not in update_data:
        update_data["email_normalized"] = normalized_email
    if not update_data:
        return

    update_data["updated_at"] = utcnow()
    await user_repo.update_by_id(current_user["_id"], {"$set": update_data})
    current_user.update(update_data)
    if payload.password:
        await revoke_all_sessions_for_user(str(current_user["_id"]), reason="password-changed")
