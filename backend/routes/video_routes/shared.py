from __future__ import annotations

from pathlib import Path

from backend.services.video_service import BACKEND_ROOT

UPLOAD_TMP = BACKEND_ROOT / "uploads" / "video_tmp"
UPLOAD_TMP.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".pdf", ".md", ".txt"}
ALLOWED_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp"}
