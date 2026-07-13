from __future__ import annotations

from datetime import datetime, timezone

from backend.repositories import staff_code_repo, user_repo
from backend.schemas import AuthSchema
from backend.services.auth.password_security_service import (
    ensure_password_strength,
    hash_password,
    utcnow,
)

from .account_validation import (
    ensure_unique_registration_identifiers,
    resolve_staff_role,
)


async def register_user(payload: AuthSchema) -> None:
    ensure_password_strength(
        payload.password,
        user_identifiers=[payload.username, payload.email or ""],
    )
    normalized_username, normalized_email = await ensure_unique_registration_identifiers(
        username=payload.username,
        email=payload.email or "",
    )
    role, active_code = await resolve_staff_role(payload.staff_code)
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
