from __future__ import annotations

from fastapi import Depends

from backend.core.security import get_current_user

from .artifacts import download_ppt, download_script
from .router import legacy_sub1_router


@legacy_sub1_router.get("/download_script/{filename}")
def legacy_download_script(filename: str, user: dict = Depends(get_current_user)):
    return download_script(filename, user)


@legacy_sub1_router.get("/download_ppt/{filename}")
def legacy_download_ppt(filename: str, user: dict = Depends(get_current_user)):
    return download_ppt(filename)
