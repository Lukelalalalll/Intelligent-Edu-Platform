from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from backend.repositories import staff_code_repo


async def generate_staff_code(*, admin_user_id: str) -> dict:
    code = secrets.token_hex(4).upper()
    now = datetime.now(timezone.utc)
    document = {
        "code": code,
        "created_by": admin_user_id,
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "is_used": False,
        "used_by": None,
        "used_at": None,
    }
    await staff_code_repo.insert_code(document)
    return {"code": code, "expires_at": document["expires_at"].isoformat()}


async def list_staff_codes(*, skip: int = 0, limit: int = 200) -> list[dict]:
    codes = await staff_code_repo.list_codes(skip=skip, limit=limit)
    return [
        {
            "code": code["code"],
            "is_used": code["is_used"],
            "created_at": code["created_at"].isoformat(),
            "expires_at": code["expires_at"].isoformat(),
            "used_by": code.get("used_by"),
            "used_at": code["used_at"].isoformat() if code.get("used_at") else None,
        }
        for code in codes
    ]


async def revoke_staff_code(*, code: str) -> None:
    result = await staff_code_repo.delete_unused_code(code.upper())
    if not result or result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Code not found or already used")
