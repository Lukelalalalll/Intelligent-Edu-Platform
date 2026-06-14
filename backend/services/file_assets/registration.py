from __future__ import annotations

import uuid
from typing import Any

from backend.core.database import db

from .shared import normalize_path, to_iso, utcnow


async def register_file_asset(
    *,
    file_type: str,
    storage_path: str,
    size: int,
    owner_type: str,
    owner_id: str,
    created_by: str,
    filename: str = "",
    mime_type: str = "",
    checksum: str = "",
    course_id: str = "",
    public_url: str = "",
    scope: str = "",
    room_id: str = "",
    user_id: str = "",
    session_id: str = "",
    conversation_date: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = utcnow()
    document = {
        "file_id": str(uuid.uuid4()),
        "file_type": file_type,
        "storage_path": normalize_path(storage_path),
        "size": int(size or 0),
        "owner_type": owner_type,
        "owner_id": str(owner_id or ""),
        "course_id": str(course_id or ""),
        "filename": str(filename or ""),
        "mime_type": str(mime_type or ""),
        "checksum": str(checksum or ""),
        "public_url": str(public_url or ""),
        "scope": str(scope or ""),
        "room_id": str(room_id or ""),
        "user_id": str(user_id or ""),
        "session_id": str(session_id or ""),
        "conversation_date": str(conversation_date or ""),
        "created_by": str(created_by or ""),
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "status": "active",
        "metadata": metadata or {},
    }
    await db.file_assets.insert_one(document)
    return to_iso(document)
