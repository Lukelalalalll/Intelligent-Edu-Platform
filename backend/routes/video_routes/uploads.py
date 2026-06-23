from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import Depends, File, HTTPException, UploadFile

from backend.core.security import get_current_user

from fastapi import APIRouter
router = APIRouter()
from .shared import ALLOWED_IMG_EXT, UPLOAD_TMP


@router.post("/upload-scene-image")
async def upload_scene_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an image for a specific scene. Returns the server-side filename."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_IMG_EXT:
        raise HTTPException(400, f"Unsupported image type: {suffix}")
    name = f"scene_{uuid.uuid4().hex}{suffix}"
    dest = UPLOAD_TMP / name
    dest.write_bytes(await file.read())
    return {"filename": name, "path": str(dest)}
