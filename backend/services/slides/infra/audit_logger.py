"""Audit logger for the Sub1 PPT generation pipeline."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class AuditLogger:
    """
    Full-chain audit log: who initiated, when, which step, duration, result.
    Writes to sub1_audit_log collection in MongoDB.
    """

    @staticmethod
    async def log(
        *,
        action: str,
        user_id: str = "",
        request_id: str = "",
        details: dict[str, Any] | None = None,
        duration_ms: float = 0,
        success: bool = True,
        error: str = "",
    ) -> None:
        """Record a single audit event."""
        from backend.core.database import db

        doc = {
            "action": action,
            "user_id": user_id,
            "request_id": request_id,
            "details": details or {},
            "duration_ms": round(duration_ms, 2),
            "success": success,
            "error": error[:500] if error else "",
            "timestamp": datetime.now(timezone.utc),
        }
        try:
            await db["sub1_audit_log"].insert_one(doc)
        except Exception:
            logger.exception("Failed to write audit log")

    @staticmethod
    async def get_logs(
        *,
        user_id: str | None = None,
        action: str | None = None,
        hours: int = 24,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query audit logs with optional filters."""
        from datetime import timedelta
        from backend.core.database import db

        query: dict[str, Any] = {
            "timestamp": {"$gte": datetime.now(timezone.utc) - timedelta(hours=hours)}
        }
        if user_id:
            query["user_id"] = user_id
        if action:
            query["action"] = action

        cursor = db["sub1_audit_log"].find(
            query, {"_id": 0}
        ).sort("timestamp", -1).limit(limit)
        return await cursor.to_list(limit)
