"""Staff invitation code management."""
from __future__ import annotations

from fastapi import Depends, Query

from backend.core.security import get_admin_user
from backend.services.admin.admin_staff_code_service import (
    generate_staff_code as generate_staff_code_service,
)
from backend.services.admin.admin_staff_code_service import (
    list_staff_codes as list_staff_codes_service,
)
from backend.services.admin.admin_staff_code_service import (
    revoke_staff_code as revoke_staff_code_service,
)
from fastapi import APIRouter
router = APIRouter()


@router.post("/staff-codes/generate")
async def generate_staff_code(admin: dict = Depends(get_admin_user)):
    return await generate_staff_code_service(admin_user_id=str(admin["_id"]))


@router.get("/staff-codes")
async def list_staff_codes(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    admin: dict = Depends(get_admin_user),
):
    return await list_staff_codes_service(skip=skip, limit=limit)


@router.delete("/staff-codes/{code}")
async def revoke_staff_code(code: str, admin: dict = Depends(get_admin_user)):
    await revoke_staff_code_service(code=code)
