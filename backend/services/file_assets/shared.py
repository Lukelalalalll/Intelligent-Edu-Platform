from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId

from backend.config import Config


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [to_iso(item) for item in value]
    if isinstance(value, dict):
        return {key: to_iso(item) for key, item in value.items()}
    return value


def normalize_path(storage_path: str) -> str:
    return str(storage_path or "").replace("\\", "/").strip()


def absolute_from_storage_path(storage_path: str) -> Path:
    rel = normalize_path(storage_path).lstrip("/")
    return Path(Config.BASE_DIR) / rel
