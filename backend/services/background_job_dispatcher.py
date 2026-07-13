from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.repositories import background_job_repo


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_to_iso(item) for item in value]
    if isinstance(value, dict):
        return {key: _to_iso(item) for key, item in value.items()}
    return value


class BackgroundJobDispatcher:
    def __init__(self, *, repo=background_job_repo):
        self._repo = repo

    async def enqueue(
        self,
        *,
        job_type: str,
        payload: dict[str, Any],
        queue: str = "default",
        metadata: dict[str, Any] | None = None,
        run_after: datetime | None = None,
    ) -> dict[str, Any]:
        now = _utcnow()
        document = {
            "job_id": uuid.uuid4().hex,
            "job_type": str(job_type or "").strip(),
            "queue": str(queue or "default"),
            "payload": dict(payload or {}),
            "metadata": dict(metadata or {}),
            "status": "pending",
            "attempts": 0,
            "claimed_by": "",
            "claimed_at": None,
            "lease_expires_at": None,
            "available_at": run_after or now,
            "last_error": "",
            "result": None,
            "created_at": now,
            "updated_at": now,
        }
        await self._repo.insert_job(document)
        return _to_iso(document)

    async def claim(
        self,
        *,
        worker_id: str,
        job_types: list[str] | None = None,
        lease_seconds: int = 300,
        job_id: str | None = None,
    ) -> dict[str, Any] | None:
        now = _utcnow()
        lease_expires_at = now + timedelta(seconds=max(1, int(lease_seconds or 300)))
        document = await self._repo.claim_job(
            worker_id=worker_id,
            now=now,
            lease_expires_at=lease_expires_at,
            job_types=job_types,
            job_id=job_id,
        )
        return _to_iso(document) if document else None

    async def mark_done(
        self,
        *,
        job_id: str,
        worker_id: str,
        result: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        document = await self._repo.mark_done(
            job_id=job_id,
            worker_id=worker_id,
            now=_utcnow(),
            result=result,
        )
        return _to_iso(document) if document else None

    async def mark_failed(
        self,
        *,
        job_id: str,
        worker_id: str,
        error: str,
    ) -> dict[str, Any] | None:
        document = await self._repo.mark_failed(
            job_id=job_id,
            worker_id=worker_id,
            now=_utcnow(),
            error=str(error or ""),
        )
        return _to_iso(document) if document else None


background_job_dispatcher = BackgroundJobDispatcher()
