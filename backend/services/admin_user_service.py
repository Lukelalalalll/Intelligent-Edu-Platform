from __future__ import annotations

from backend.repositories import user_repo
from backend.schemas import AuthSchema, UpdateProfileSchema
from backend.services.password_security_service import (
    ensure_password_strength,
    hash_password,
    normalize_email,
    normalize_username,
    utcnow,
)
from backend.services.auth_session_service import revoke_all_sessions_for_user


def _serialize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "email": doc["email"],
        "role": doc.get("role", "student"),
        "teacherCourseIds": doc.get("teacherCourseIds", []),
    }


async def list_admin_users() -> list[dict]:
    users = await user_repo.list_users(limit=1000)
    return [_serialize_user(user) for user in users]


async def create_admin_user(payload: AuthSchema) -> None:
    normalized_username = normalize_username(payload.username)
    normalized_email = normalize_email(payload.email or "")
    existing_username = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
    if existing_username is None:
        existing_username = await user_repo.find_by_username(payload.username.strip(), {"_id": 1})
    if existing_username:
        raise ValueError("Username already taken")
    existing_email = None
    if normalized_email:
        existing_email = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email is None:
            existing_email = await user_repo.find_by_email((payload.email or "").strip(), {"_id": 1})
    if existing_email:
        raise ValueError("Email already taken")

    raw_password = payload.password or "123456789abc"
    ensure_password_strength(raw_password, user_identifiers=[payload.username, payload.email or ""])
    password_hash, password_algo = hash_password(raw_password)

    await user_repo.insert_user(
        {
            "username": payload.username.strip(),
            "username_normalized": normalized_username,
            "email": (payload.email or "").strip(),
            "email_normalized": normalized_email,
            "password_hash": password_hash,
            "password_algo": password_algo,
            "password_changed_at": utcnow(),
            "role": payload.role,
            "teacherCourseIds": payload.teacherCourseIds or [],
            "token_version": 1,
            "status": "active",
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )


async def update_admin_user(*, user_id: str, payload: UpdateProfileSchema, admin_user_id: str) -> None:
    if admin_user_id == user_id and payload.role != "admin":
        raise ValueError("Cannot remove your own admin status")

    current_user = await user_repo.find_by_id(user_id, {"token_version": 1})
    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("password", None)
    if payload.username:
        normalized_username = normalize_username(payload.username)
        existing = await user_repo.find_by_username_normalized(normalized_username, {"_id": 1})
        if existing is None:
            existing = await user_repo.find_by_username(payload.username.strip(), {"_id": 1})
        if existing and str(existing["_id"]) != str(user_id):
            raise ValueError("Username already taken")
        update_data["username"] = payload.username.strip()
        update_data["username_normalized"] = normalized_username
    if payload.email:
        normalized_email = normalize_email(payload.email)
        existing_email = await user_repo.find_by_email_normalized(normalized_email, {"_id": 1})
        if existing_email is None:
            existing_email = await user_repo.find_by_email(payload.email.strip(), {"_id": 1})
        if existing_email and str(existing_email["_id"]) != str(user_id):
            raise ValueError("Email already taken")
        update_data["email"] = payload.email.strip()
        update_data["email_normalized"] = normalized_email
    if payload.password:
        ensure_password_strength(payload.password, user_identifiers=[payload.username or "", payload.email or ""])
        password_hash, password_algo = hash_password(payload.password)
        update_data["password_hash"] = password_hash
        update_data["password_algo"] = password_algo
        update_data["password_changed_at"] = utcnow()
        update_data["token_version"] = int((current_user or {}).get("token_version") or 0) + 1

    update_data["updated_at"] = utcnow()

    await user_repo.update_by_id(user_id, {"$set": update_data})
    if payload.password:
        await revoke_all_sessions_for_user(str(user_id), reason="admin-password-reset")


async def delete_admin_user(*, user_id: str, admin_user_id: str) -> None:
    if admin_user_id == user_id:
        raise ValueError("Cannot delete yourself")

    await user_repo.delete_by_id(user_id)


async def set_admin_user_status(*, user_id: str, status: str, admin_user_id: str) -> None:
    if admin_user_id == user_id and status != "active":
        raise ValueError("Cannot disable or suspend yourself")

    current_user = await user_repo.find_by_id(user_id, {"_id": 1})
    if not current_user:
        raise ValueError("User not found")

    await user_repo.update_by_id(user_id, {"$set": {"status": status, "updated_at": utcnow()}})
