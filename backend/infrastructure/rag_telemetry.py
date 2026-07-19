"""
RAG Telemetry — Record per-retrieval performance metrics and evaluate
alert rules.  Stored in MongoDB collection `rag_telemetry`.

Usage:
    from backend.infrastructure.rag_telemetry import rag_telemetry

    await rag_telemetry.record(
        user_id="stu001", role="student", course_ids=["CS101"],
        query="What is OOP?", result_count=4, latency_ms=112.5,
        use_hybrid=True, top_k=5,
    )

    stats = await rag_telemetry.get_stats(hours=24)
    alerts = await rag_telemetry.check_alerts(hours=1)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from backend.infrastructure.quantiles import TDigest
from backend.repositories import telemetry_repo

logger = logging.getLogger(__name__)

COLLECTION = "rag_telemetry"

# Default alert thresholds (overridable at query time)
DEFAULT_THRESHOLDS: Dict[str, float] = {
    "p95_latency_ms": 2000,        # P95 > 2 s
    "empty_retrieval_rate": 0.25,   # > 25 %
    "hit_rate_drop_pct": 10,        # > 10 % drop vs baseline
}


def _clamp_limit(value: int, *, default: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(maximum, parsed))


class RAGTelemetry:
    """Records per-query RAG retrieval metrics and surfaces alerts."""

    # ── write ───────────────────────────────────────────────────────
    async def record(
        self,
        *,
        user_id: str = "",
        role: str = "",
        course_ids: List[str] | None = None,
        query: str = "",
        result_count: int = 0,
        latency_ms: float = 0,
        use_hybrid: bool = False,
        top_k: int = 5,
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        doc: Dict[str, Any] = {
            "user_id": user_id,
            "role": role,
            "course_ids": course_ids or [],
            "query_len": len(query),
            "result_count": result_count,
            "empty": result_count == 0,
            "latency_ms": round(latency_ms, 2),
            "use_hybrid": use_hybrid,
            "top_k": top_k,
            "timestamp": datetime.now(timezone.utc),
        }
        if metadata:
            doc["metadata"] = metadata
        try:
            await telemetry_repo.insert_rag(doc)
        except Exception:
            logger.exception("Failed to record RAG telemetry")

    # ── read: aggregate stats ───────────────────────────────────────
    async def get_stats(self, hours: int = 24) -> Dict[str, Any]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}},
                    "avg_latency_ms": {"$avg": "$latency_ms"},
                    "latencies": {"$push": "$latency_ms"},
                    "avg_result_count": {"$avg": "$result_count"},
                    "hybrid_count": {"$sum": {"$cond": ["$use_hybrid", 1, 0]}},
                }
            },
        ]
        rows = await telemetry_repo.aggregate_rag(pipeline, length=1)
        if not rows:
            return {"period_hours": hours, "total": 0}

        r = rows[0]
        digest = TDigest()
        for v in r.get("latencies", []):
            digest.update(v)
        p50 = digest.percentile(50) if digest.n else 0
        p95 = digest.percentile(95) if digest.n else 0
        total = r["total"] or 1

        return {
            "period_hours": hours,
            "total": r["total"],
            "empty_retrieval_rate": round(r["empty_count"] / total, 4),
            "avg_latency_ms": round(r["avg_latency_ms"] or 0, 2),
            "p50_latency_ms": round(p50, 2),
            "p95_latency_ms": round(p95, 2),
            "avg_result_count": round(r["avg_result_count"] or 0, 2),
            "hybrid_pct": round(r["hybrid_count"] / total * 100, 1),
        }

    # ── read: per-course breakdown ──────────────────────────────────
    async def get_course_breakdown(self, hours: int = 24, limit: int = 200) -> List[Dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        safe_limit = _clamp_limit(limit, default=200, maximum=500)
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {"$unwind": "$course_ids"},
            {
                "$group": {
                    "_id": "$course_ids",
                    "total": {"$sum": 1},
                    "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}},
                    "avg_latency_ms": {"$avg": "$latency_ms"},
                }
            },
            {"$sort": {"total": -1}},
            {
                "$project": {
                    "_id": 0,
                    "course_id": "$_id",
                    "total": 1,
                    "empty_count": 1,
                    "empty_rate": {
                        "$round": [{"$divide": ["$empty_count", {"$max": ["$total", 1]}]}, 4]
                    },
                    "avg_latency_ms": {"$round": ["$avg_latency_ms", 2]},
                }
            },
        ]
        return await telemetry_repo.aggregate_rag(pipeline, length=safe_limit)

    # ── read: per-role breakdown ────────────────────────────────────
    async def get_role_breakdown(self, hours: int = 24, limit: int = 20) -> List[Dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        safe_limit = _clamp_limit(limit, default=20, maximum=100)
        pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": "$role",
                    "total": {"$sum": 1},
                    "empty_count": {"$sum": {"$cond": ["$empty", 1, 0]}},
                    "avg_latency_ms": {"$avg": "$latency_ms"},
                }
            },
            {"$sort": {"total": -1}},
            {
                "$project": {
                    "_id": 0,
                    "role": {"$ifNull": ["$_id", "unknown"]},
                    "total": 1,
                    "empty_count": 1,
                    "avg_latency_ms": {"$round": ["$avg_latency_ms", 2]},
                }
            },
        ]
        return await telemetry_repo.aggregate_rag(pipeline, length=safe_limit)

    # ── helpers ──────────────────────────────────────────────────────
    async def _get_hit_rate(self, start: datetime, end: datetime) -> float | None:
        """Return hit rate (result_count > 0) for the given time window, or None if no data."""
        pipeline = [
            {"$match": {"timestamp": {"$gte": start, "$lt": end}}},
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "hits": {"$sum": {"$cond": [{"$gt": ["$result_count", 0]}, 1, 0]}},
                }
            },
        ]
        rows = await telemetry_repo.aggregate_rag(pipeline, length=1)
        if not rows or rows[0]["total"] == 0:
            return None
        return rows[0]["hits"] / rows[0]["total"]

    # ── alert check ─────────────────────────────────────────────────
    async def check_alerts(
        self, hours: int = 1, thresholds: Dict[str, float] | None = None
    ) -> List[Dict[str, Any]]:
        """
        Compare recent RAG stats against thresholds and return active alerts.
        """
        th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
        stats = await self.get_stats(hours)
        if stats.get("total", 0) < 5:
            return []  # too few samples to alert

        alerts: List[Dict[str, Any]] = []

        # P95 latency
        p95 = stats.get("p95_latency_ms", 0)
        if p95 > th["p95_latency_ms"]:
            alerts.append({
                "rule": "p95_latency",
                "severity": "warning",
                "message": f"P95 retrieval latency is {p95:.0f} ms (threshold: {th['p95_latency_ms']:.0f} ms)",
                "value": p95,
                "threshold": th["p95_latency_ms"],
            })

        # Empty retrieval rate
        er = stats.get("empty_retrieval_rate", 0)
        if er > th["empty_retrieval_rate"]:
            alerts.append({
                "rule": "empty_retrieval_rate",
                "severity": "warning",
                "message": f"Empty retrieval rate is {er*100:.1f}% (threshold: {th['empty_retrieval_rate']*100:.0f}%)",
                "value": er,
                "threshold": th["empty_retrieval_rate"],
            })

        # Hit-rate drop vs baseline (24 h ago, same window length)
        now = datetime.now(timezone.utc)
        current_start = now - timedelta(hours=hours)
        baseline_start = current_start - timedelta(hours=24)
        baseline_end = baseline_start + timedelta(hours=hours)

        current_hit_rate = await self._get_hit_rate(current_start, now)
        baseline_hit_rate = await self._get_hit_rate(baseline_start, baseline_end)

        if current_hit_rate is not None and baseline_hit_rate is not None:
            drop_pct = (baseline_hit_rate - current_hit_rate) * 100
            if drop_pct > th["hit_rate_drop_pct"]:
                alerts.append({
                    "rule": "hit_rate_drop",
                    "severity": "warning",
                    "message": (
                        f"Hit rate dropped from {baseline_hit_rate*100:.1f}% to "
                        f"{current_hit_rate*100:.1f}% ({drop_pct:.1f} pp drop, "
                        f"threshold: {th['hit_rate_drop_pct']:.0f} pp)"
                    ),
                    "value": round(drop_pct, 1),
                    "threshold": th["hit_rate_drop_pct"],
                    "current_hit_rate": round(current_hit_rate, 4),
                    "baseline_hit_rate": round(baseline_hit_rate, 4),
                })

        return alerts


rag_telemetry = RAGTelemetry()
