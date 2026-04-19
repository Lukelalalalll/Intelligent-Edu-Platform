"""
LLM Telemetry — Track all LLM API calls with cost, latency, token usage,
error classification, and cost estimation per provider / model.

Usage:
    from backend.infrastructure import llm_telemetry, TelemetryTimer

    # ---- Context-manager (preferred) ----
    timer = TelemetryTimer(
        provider="zhipu", model="glm-4v-plus",
        endpoint="extract_questions", user_id="t001",
        api_type="vision",
    )
    with timer:
        result = await call_llm(...)
    await timer.save(prompt_tokens=500, completion_tokens=200)

    # ---- One-shot record ----
    await llm_telemetry.record(provider="coze", model="coze-bot", ...)

    # ---- Aggregation ----
    stats     = await llm_telemetry.get_stats(hours=24)
    ts_data   = await llm_telemetry.get_timeseries(hours=24, bucket_minutes=60)
    breakdown = await llm_telemetry.get_breakdown(hours=24, group_by="provider")
    cost      = await llm_telemetry.get_cost_summary(hours=24)
    errors    = await llm_telemetry.get_recent_errors(limit=20)
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from tdigest import TDigest

from backend.core.database import db

logger = logging.getLogger(__name__)

COLLECTION = "llm_telemetry"

# ---------------------------------------------------------------------------
# Cost table  (USD per 1 000 tokens)
# ---------------------------------------------------------------------------
_COST_PER_1K: dict[str, dict[str, tuple[float, float]]] = {
    # provider -> model -> (prompt_cost, completion_cost)
    "zhipu": {
        "glm-4v-plus": (0.01, 0.01),
        "glm-4-plus":  (0.05, 0.05),
        "glm-4v":      (0.01, 0.01),
        "_default":    (0.01, 0.01),
    },
    "deepseek": {
        "deepseek-chat":  (0.0014, 0.0028),
        "deepseek-coder": (0.0014, 0.0028),
        "_default":       (0.0014, 0.0028),
    },
    "coze": {
        "_default": (0.0, 0.0),  # bundled pricing — no per-token cost
    },
}


def estimate_cost(
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    """Return estimated cost in USD."""
    provider_table = _COST_PER_1K.get(provider, {})
    prompt_rate, comp_rate = provider_table.get(
        model, provider_table.get("_default", (0.0, 0.0))
    )
    return round(
        prompt_tokens / 1000 * prompt_rate + completion_tokens / 1000 * comp_rate,
        6,
    )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------
_ERROR_MAP: list[tuple[str, list[str]]] = [
    ("rate_limit",    ["rate limit", "429", "too many requests"]),
    ("timeout",       ["timeout", "timed out", "deadline exceeded"]),
    ("auth",          ["401", "403", "unauthorized", "forbidden", "invalid api key"]),
    ("context_limit", ["context length", "max tokens", "too long"]),
    ("server_error",  ["500", "502", "503", "504", "internal server error"]),
]


def classify_error(error_text: str) -> str:
    """Map raw error text to a category slug."""
    lower = error_text.lower()
    for category, keywords in _ERROR_MAP:
        if any(kw in lower for kw in keywords):
            return category
    return "unknown"


# ---------------------------------------------------------------------------
# Core telemetry class
# ---------------------------------------------------------------------------
class LLMTelemetry:
    """Records and queries LLM API call metrics."""

    # ---- write ----
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
        # new v2 fields ---
        api_type: str = "",
        credential_alias: str = "",
        request_id: str = "",
    ) -> None:
        """Persist a single LLM API call record."""
        total_tokens = prompt_tokens + completion_tokens
        cost = estimate_cost(provider, model, prompt_tokens, completion_tokens)
        error_code = classify_error(error) if error else ""

        doc: dict[str, Any] = {
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "latency_ms": round(latency_ms, 2),
            "endpoint": endpoint,
            "user_id": user_id,
            "success": success,
            "error": error[:500] if error else "",
            "error_code": error_code,
            "api_type": api_type,
            "credential_alias": credential_alias,
            "estimated_cost": cost,
            "request_id": request_id or uuid.uuid4().hex[:16],
            "timestamp": datetime.now(timezone.utc),
        }
        if metadata:
            doc["metadata"] = metadata

        try:
            await db[COLLECTION].insert_one(doc)
        except Exception:
            logger.exception("Failed to record LLM telemetry")

    # ---- read: overview stats per provider ----
    async def get_stats(self, hours: int = 24) -> dict[str, Any]:
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
                    "total_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
                    "avg_latency_ms": {"$avg": "$latency_ms"},
                    "max_latency_ms": {"$max": "$latency_ms"},
                    "min_latency_ms": {"$min": "$latency_ms"},
                    "latencies": {"$push": "$latency_ms"},
                }
            },
        ]

        results = await db[COLLECTION].aggregate(pipeline).to_list(100)
        providers: dict[str, Any] = {}
        for r in results:
            digest = TDigest()
            for v in r.get("latencies", []):
                digest.update(v)
            p50 = digest.percentile(50) if digest.weight() else 0
            p95 = digest.percentile(95) if digest.weight() else 0
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
                "total_cost": round(r["total_cost"], 6),
                "avg_latency_ms": round(r["avg_latency_ms"] or 0, 2),
                "p50_latency_ms": round(p50, 2),
                "p95_latency_ms": round(p95, 2),
                "max_latency_ms": round(r["max_latency_ms"] or 0, 2),
            }

        return {"period_hours": hours, "providers": providers}

    # ---- read: time series ----
    async def get_timeseries(
        self, *, hours: int = 24, bucket_minutes: int = 60
    ) -> list[dict[str, Any]]:
        """Return call-count / latency / cost bucketed by time."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        bucket_ms = bucket_minutes * 60 * 1000

        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": {
                        "$subtract": [
                            {"$toLong": "$timestamp"},
                            {"$mod": [{"$toLong": "$timestamp"}, bucket_ms]},
                        ]
                    },
                    "calls": {"$sum": 1},
                    "errors": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "avg_latency": {"$avg": "$latency_ms"},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "total_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
                }
            },
            {"$sort": {"_id": 1}},
            {
                "$project": {
                    "_id": 0,
                    "bucket": {"$toDate": "$_id"},
                    "calls": 1,
                    "errors": 1,
                    "avg_latency": {"$round": ["$avg_latency", 1]},
                    "total_tokens": 1,
                    "total_cost": {"$round": ["$total_cost", 6]},
                }
            },
        ]
        return await db[COLLECTION].aggregate(pipeline).to_list(500)

    # ---- read: breakdown by arbitrary dimension ----
    async def get_breakdown(
        self, *, hours: int = 24, group_by: str = "provider"
    ) -> list[dict[str, Any]]:
        """Group calls by dimension (provider / model / endpoint / api_type / error_code)."""
        allowed = {"provider", "model", "endpoint", "api_type", "error_code"}
        if group_by not in allowed:
            group_by = "provider"

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": f"${group_by}",
                    "calls": {"$sum": 1},
                    "errors": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "avg_latency": {"$avg": "$latency_ms"},
                    "total_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
                }
            },
            {"$sort": {"calls": -1}},
            {
                "$project": {
                    "_id": 0,
                    "name": {"$ifNull": ["$_id", "unknown"]},
                    "calls": 1,
                    "errors": 1,
                    "total_tokens": 1,
                    "avg_latency": {"$round": ["$avg_latency", 1]},
                    "total_cost": {"$round": ["$total_cost", 6]},
                }
            },
        ]
        return await db[COLLECTION].aggregate(pipeline).to_list(200)

    # ---- read: cost summary ----
    async def get_cost_summary(self, *, hours: int = 24) -> dict[str, Any]:
        """Total estimated cost grouped by provider."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": "$provider",
                    "total_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
                    "calls": {"$sum": 1},
                    "total_tokens": {"$sum": "$total_tokens"},
                }
            },
            {"$sort": {"total_cost": -1}},
        ]
        rows = await db[COLLECTION].aggregate(pipeline).to_list(50)
        by_provider = {
            r["_id"]: {
                "cost": round(r["total_cost"], 6),
                "calls": r["calls"],
                "tokens": r["total_tokens"],
            }
            for r in rows
        }
        grand_total = round(sum(v["cost"] for v in by_provider.values()), 6)
        return {
            "period_hours": hours,
            "total_cost": grand_total,
            "by_provider": by_provider,
        }

    # ---- read: recent errors ----
    async def get_recent_errors(self, limit: int = 20) -> list[dict[str, Any]]:
        cursor = (
            db[COLLECTION]
            .find(
                {"success": False},
                {
                    "_id": 0,
                    "provider": 1,
                    "model": 1,
                    "endpoint": 1,
                    "error": 1,
                    "error_code": 1,
                    "latency_ms": 1,
                    "timestamp": 1,
                    "request_id": 1,
                },
            )
            .sort("timestamp", -1)
            .limit(limit)
        )
        return await cursor.to_list(limit)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
llm_telemetry = LLMTelemetry()


# ---------------------------------------------------------------------------
# Timer context manager — auto-saves on exit (async) or deferred via save()
# ---------------------------------------------------------------------------
class TelemetryTimer:
    """Context manager to time LLM calls and record telemetry.

    Typical usage::

        timer = TelemetryTimer(provider="zhipu", model="glm-4v-plus",
                               endpoint="extract_questions", user_id="t001")
        with timer:
            result = await some_llm_call()
        await timer.save(prompt_tokens=500, completion_tokens=200)
    """

    def __init__(
        self,
        *,
        provider: str,
        model: str = "",
        endpoint: str = "",
        user_id: str = "",
        api_type: str = "",
        credential_alias: str = "",
    ):
        self.provider = provider
        self.model = model
        self.endpoint = endpoint
        self.user_id = user_id
        self.api_type = api_type
        self.credential_alias = credential_alias
        self._start: float = 0
        self.latency_ms: float = 0

    def __enter__(self) -> TelemetryTimer:
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:  # noqa: ANN001
        self.latency_ms = (time.perf_counter() - self._start) * 1000

    async def save(
        self,
        *,
        success: bool = True,
        error: str = "",
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> None:
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
            api_type=self.api_type,
            credential_alias=self.credential_alias,
            metadata=metadata,
        )
