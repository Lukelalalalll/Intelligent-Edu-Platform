from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import Depends, File, HTTPException, UploadFile
from starlette.status import HTTP_413_REQUEST_ENTITY_TOO_LARGE

from backend.config import Config
from backend.core.security import get_current_user

from fastapi import APIRouter
router = APIRouter()
from .shared import ALLOWED_IMG_EXT, UPLOAD_TMP

logger = logging.getLogger(__name__)
_MAX_SCENE_IMAGE_BYTES = 10 * 1024 * 1024
_ALLOWED_IMAGE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
}


@router.post("/upload-scene-image")
async def upload_scene_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an image for a specific scene. Returns the server-side filename."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_IMG_EXT:
        raise HTTPException(400, f"Unsupported image type: {suffix}")
    content_type = str(getattr(file, "content_type", "") or "").lower().strip()
    if content_type and content_type not in _ALLOWED_IMAGE_MIME_TYPES:
        raise HTTPException(400, f"Unsupported image MIME type: {content_type}")

    content = await file.read()
    max_bytes = min(int(getattr(Config, "MAX_CONTENT_LENGTH", _MAX_SCENE_IMAGE_BYTES)), _MAX_SCENE_IMAGE_BYTES)
    if len(content) > max_bytes:
        raise HTTPException(HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Scene image exceeds {max_bytes} bytes")

    name = f"scene_{uuid.uuid4().hex}{suffix}"
    dest = UPLOAD_TMP / name
    dest.write_bytes(content)
    logger.info(
        "video_scene_image_uploaded user_id=%s filename=%s size_bytes=%d mime=%s",
        str(current_user.get("id") or current_user.get("_id") or ""),
        name,
        len(content),
        content_type or "unknown",
    )
    return {"filename": name, "path": name}
