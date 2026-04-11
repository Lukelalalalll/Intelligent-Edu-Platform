"""
Sub1 Pipeline Checkpoint Manager — Intermediate result persistence & resume.

Provides:
- Persist each pipeline step's output as JSON to MongoDB
- Resume from any checkpoint (e.g. "resume from after highlighting")
- Re-run individual steps without replaying the entire pipeline
- TTL-based cleanup for old checkpoints

Schema per checkpoint:
{
    "task_id": "abc-123",
    "user_id": "teacher_01",
    "step": "summarize",
    "status": "success",
    "input_hash": "sha256...",      # for idempotency
    "output": { ... },               # step result (JSON-serializable)
    "created_at": datetime,
    "expires_at": datetime,          # TTL
}
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

COLLECTION = "sub1_checkpoints"
DEFAULT_TTL_HOURS = 72  # 3 days


def _compute_hash(data: Any) -> str:
    """Compute a stable SHA-256 hash of JSON-serializable data for idempotency."""
    raw = json.dumps(data, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class CheckpointManager:
    """Persist and retrieve intermediate pipeline results."""

    @staticmethod
    async def save(
        *,
        task_id: str,
        step: str,
        output: Any,
        input_data: Any = None,
        user_id: str = "",
        ttl_hours: int = DEFAULT_TTL_HOURS,
    ) -> str:
        """Save a checkpoint. Returns the input_hash for idempotency lookups."""
        from backend.core.database import db

        input_hash = _compute_hash(input_data) if input_data is not None else ""
        now = datetime.now(timezone.utc)

        doc = {
            "task_id": task_id,
            "user_id": user_id,
            "step": step,
            "status": "success",
            "input_hash": input_hash,
            "output": output,
            "created_at": now,
            "expires_at": now + timedelta(hours=ttl_hours),
        }

        # Upsert: same task_id + step => replace
        await db[COLLECTION].replace_one(
            {"task_id": task_id, "step": step},
            doc,
            upsert=True,
        )
        logger.info("[%s] checkpoint saved: step=%s hash=%s", task_id, step, input_hash)
        return input_hash

    @staticmethod
    async def load(*, task_id: str, step: str) -> dict[str, Any] | None:
        """Load a checkpoint by task_id and step. Returns None if not found or expired."""
        from backend.core.database import db

        doc = await db[COLLECTION].find_one(
            {
                "task_id": task_id,
                "step": step,
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            },
            {"_id": 0},
        )
        if doc:
            logger.info("[%s] checkpoint loaded: step=%s", task_id, step)
        return doc

    @staticmethod
    async def load_by_hash(*, step: str, input_hash: str) -> dict[str, Any] | None:
        """Load a checkpoint by step+input_hash for idempotency (same input → cached output)."""
        from backend.core.database import db

        doc = await db[COLLECTION].find_one(
            {
                "step": step,
                "input_hash": input_hash,
                "status": "success",
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            },
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if doc:
            logger.info("Idempotent cache hit: step=%s hash=%s", step, input_hash)
        return doc

    @staticmethod
    async def get_task_checkpoints(task_id: str) -> list[dict[str, Any]]:
        """List all checkpoints for a given task, ordered by creation time."""
        from backend.core.database import db

        cursor = db[COLLECTION].find(
            {"task_id": task_id},
            {"_id": 0, "output": 0},  # Exclude large output for listing
        ).sort("created_at", 1)

        return await cursor.to_list(50)

    @staticmethod
    async def get_resumable_step(task_id: str) -> str | None:
        """
        Determine the next step to resume from.
        Returns the name of the last successful step, or None if no checkpoints exist.
        """
        from backend.core.database import db

        doc = await db[COLLECTION].find_one(
            {"task_id": task_id, "status": "success"},
            {"_id": 0, "step": 1},
            sort=[("created_at", -1)],
        )
        return doc["step"] if doc else None

    @staticmethod
    async def delete_task(task_id: str) -> int:
        """Delete all checkpoints for a task. Returns count of deleted docs."""
        from backend.core.database import db
        result = await db[COLLECTION].delete_many({"task_id": task_id})
        return result.deleted_count

    @staticmethod
    async def cleanup_expired() -> int:
        """Delete all expired checkpoints. Call periodically."""
        from backend.core.database import db
        result = await db[COLLECTION].delete_many(
            {"expires_at": {"$lt": datetime.now(timezone.utc)}}
        )
        if result.deleted_count:
            logger.info("Cleaned up %d expired checkpoints", result.deleted_count)
        return result.deleted_count
