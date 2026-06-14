from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.core.database import db


async def find_active_code(code: str) -> dict[str, Any] | None:
    return await db.staff_codes.find_one({"code": code, "is_used": False})


async def insert_code(document: dict[str, Any]):
    return await db.staff_codes.insert_one(document)


async def mark_code_used(code: str, *, used_by: str, used_at: datetime):
    return await db.staff_codes.update_one(
        {"code": code},
        {"$set": {"is_used": True, "used_by": used_by, "used_at": used_at}},
    )


async def list_codes(limit: int = 200) -> list[dict[str, Any]]:
    return await db.staff_codes.find().sort("created_at", -1).to_list(length=limit)


async def delete_unused_code(code: str):
    return await db.staff_codes.delete_one({"code": code, "is_used": False})
