from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from backend.repositories import video_script_job_repo


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VideoScriptJobService:
    @staticmethod
    async def create_job(*, user_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        now = _utcnow()
        job = {
            "job_id": uuid.uuid4().hex,
            "user_id": user_id,
            "status": "running",
            "progress": 0,
            "message": "Starting...",
            "scripts": None,
            "slideContents": None,
            "meta": dict(meta or {}),
            "created_at": now,
            "updated_at": now,
        }
        await video_script_job_repo.insert_job(job)
        return job

    @staticmethod
    async def update_job(job_id: str, *, user_id: str, **fields) -> dict[str, Any] | None:
        fields["updated_at"] = _utcnow()
        return await video_script_job_repo.update_job(job_id, user_id=user_id, set_fields=fields)

    @staticmethod
    async def get_job(job_id: str, *, user_id: str | None = None) -> dict[str, Any] | None:
        return await video_script_job_repo.find_job(job_id, user_id=user_id)
