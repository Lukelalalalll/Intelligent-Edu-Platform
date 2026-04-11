"""Staff invitation code management."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone, timedelta

from fastapi import Depends, HTTPException

from backend.core.database import db
from backend.core.security import get_admin_user
from .router import admin_router


@admin_router.post("/staff-codes/generate")
async def generate_staff_code(admin: dict = Depends(get_admin_user)):
    code = secrets.token_hex(4).upper()  # 8 uppercase hex chars
    now = datetime.now(timezone.utc)
    doc = {
        "code": code,
        "created_by": str(admin["_id"]),
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "is_used": False,
        "used_by": None,
        "used_at": None,
    }
    await db.staff_codes.insert_one(doc)
    return {"code": code, "expires_at": doc["expires_at"].isoformat()}


@admin_router.get("/staff-codes")
async def list_staff_codes(admin: dict = Depends(get_admin_user)):
    codes = await db.staff_codes.find().sort("created_at", -1).to_list(200)
    return [
        {
            "code": c["code"],
            "is_used": c["is_used"],
            "created_at": c["created_at"].isoformat(),
            "expires_at": c["expires_at"].isoformat(),
            "used_by": c.get("used_by"),
            "used_at": c["used_at"].isoformat() if c.get("used_at") else None,
        }
        for c in codes
    ]


@admin_router.delete("/staff-codes/{code}")
async def revoke_staff_code(code: str, admin: dict = Depends(get_admin_user)):
    result = await db.staff_codes.delete_one({"code": code.upper(), "is_used": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Code not found or already used")
