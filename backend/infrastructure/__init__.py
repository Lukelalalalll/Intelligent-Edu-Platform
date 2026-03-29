"""
LLM Telemetry — Track all LLM API calls with cost, latency, and token usage.

Usage:
    from backend.infrastructure.telemetry import llm_telemetry

    # Record a call
    await llm_telemetry.record(
        provider="coze",
        model="coze-bot",
        prompt_tokens=500,
        completion_tokens=200,
        latency_ms=1200,
        endpoint="analyze_submission",
        user_id="teacher_001",
        success=True,
    )

    # Query stats
    stats = await llm_telemetry.get_stats(hours=24)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from backend.core.database import db

logger = logging.getLogger(__name__)

COLLECTION = "llm_telemetry"


class LLMTelemetry:
    """Records and queries LLM API call metrics."""

    async def record(
        self,
        *,
        provider: str,
        model: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        latency_ms: float = 0,
        endpoint: str = "",
        user_id: str = "",
        success: bool = True,
        error: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record a single LLM API call."""
        doc = {
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "latency_ms": round(latency_ms, 2),
            "endpoint": endpoint,
            "user_id": user_id,
            "success": success,
            "error": error[:500] if error else "",
            "timestamp": datetime.now(timezone.utc),
        }
        if metadata:
            doc["metadata"] = metadata

        try:
            await db[COLLECTION].insert_one(doc)
        except Exception:
            logger.exception("Failed to record LLM telemetry")

    async def get_stats(self, hours: int = 24) -> dict[str, Any]:
        """Get aggregate stats for the last N hours including P50/P95 latency."""
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": "$provider",
                    "total_calls": {"$sum": 1},
                    "successful_calls": {"$sum": {"$cond": ["$success", 1, 0]}},
                    "failed_calls": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "total_prompt_tokens": {"$sum": "$prompt_tokens"},
                    "total_completion_tokens": {"$sum": "$completion_tokens"},
                    "avg_latency_ms": {"$avg": "$latency_ms"},
                    "max_latency_ms": {"$max": "$latency_ms"},
                    "min_latency_ms": {"$min": "$latency_ms"},
                    "latencies": {"$push": "$latency_ms"},
                }
            },
        ]

        results = await db[COLLECTION].aggregate(pipeline).to_list(100)
        providers = {}
        for r in results:
            latencies = sorted(r.get("latencies", []))
            p50 = latencies[len(latencies) // 2] if latencies else 0
            p95_idx = int(len(latencies) * 0.95)
            p95 = latencies[min(p95_idx, len(latencies) - 1)] if latencies else 0
            total = r["total_calls"]
            success_rate = round(r["successful_calls"] / total * 100, 1) if total else 0

            providers[r["_id"]] = {
                "total_calls": total,
                "successful_calls": r["successful_calls"],
                "failed_calls": r["failed_calls"],
                "success_rate_pct": success_rate,
                "total_tokens": r["total_tokens"],
                "total_prompt_tokens": r["total_prompt_tokens"],
                "total_completion_tokens": r["total_completion_tokens"],
                "avg_latency_ms": round(r["avg_latency_ms"] or 0, 2),
                "p50_latency_ms": round(p50, 2),
                "p95_latency_ms": round(p95, 2),
                "max_latency_ms": round(r["max_latency_ms"] or 0, 2),
            }

        return {
            "period_hours": hours,
            "providers": providers,
        }

    async def get_recent_errors(self, limit: int = 20) -> list[dict[str, Any]]:
        """Get most recent error records for debugging."""
        cursor = db[COLLECTION].find(
            {"success": False},
            {"_id": 0, "provider": 1, "model": 1, "endpoint": 1, "error": 1, "latency_ms": 1, "timestamp": 1},
        ).sort("timestamp", -1).limit(limit)
        return await cursor.to_list(limit)


# Singleton
llm_telemetry = LLMTelemetry()


class TelemetryTimer:
    """Context manager to time LLM calls and auto-record telemetry."""

    def __init__(self, *, provider: str, model: str = "", endpoint: str = "", user_id: str = ""):
        self.provider = provider
        self.model = model
        self.endpoint = endpoint
        self.user_id = user_id
        self._start: float = 0
        self.latency_ms: float = 0

    def __enter__(self) -> TelemetryTimer:
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.latency_ms = (time.perf_counter() - self._start) * 1000

    async def save(self, *, success: bool = True, error: str = "", prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        await llm_telemetry.record(
            provider=self.provider,
            model=self.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            latency_ms=self.latency_ms,
            endpoint=self.endpoint,
            user_id=self.user_id,
            success=success,
            error=error,
        )
