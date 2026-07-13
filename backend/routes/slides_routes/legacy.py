from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.core.security import get_current_user

from .artifacts import download_ppt, download_script
router = APIRouter()


@router.get("/download_script/{filename}")
async def legacy_download_script(filename: str, user: dict = Depends(get_current_user)):
    return await download_script(filename, user)


@router.get("/download_ppt/{filename}")
async def legacy_download_ppt(filename: str, user: dict = Depends(get_current_user)):
    return await download_ppt(filename, user)
