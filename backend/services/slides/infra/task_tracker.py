"""
Sub1 Pipeline Task Tracker — Step-level observability for the PPT generation pipeline.

Provides:
- request_id full-chain tracing
- Step-level timing (parse, highlight, summarize, ppt, script)
- Error classification (input_error, model_error, template_error, render_error, unknown)
- Task timeline with success/failure per step
- Aggregated stats (success rate, avg/P95 latency)

Usage:
    tracker = TaskTracker(request_id="abc-123", user_id="teacher_01")
    with tracker.step("parse"):
        ... do parsing ...
    with tracker.step("summarize"):
        ... do summarization ...
    await tracker.save()       # persist to MongoDB
    timeline = tracker.timeline()  # get step-level timeline
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class ErrorCategory(str, Enum):
    INPUT_ERROR = "input_error"
    MODEL_ERROR = "model_error"
    TEMPLATE_ERROR = "template_error"
    RENDER_ERROR = "render_error"
    UNKNOWN = "unknown"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class TaskStatus(str, Enum):
    """Task-level state machine:
    queued -> running -> success | failed | partial_success
    running -> cancelled
    """
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"
    CANCELLED = "cancelled"

    @staticmethod
    def valid_transitions() -> dict[str, list[str]]:
        return {
            "queued": ["running", "cancelled"],
            "running": ["success", "failed", "partial_success", "cancelled"],
            # Terminal states — no outgoing transitions
            "success": [],
            "failed": [],
            "partial_success": [],
            "cancelled": [],
        }

    def can_transition_to(self, target: TaskStatus) -> bool:
        allowed = self.valid_transitions().get(self.value, [])
        return target.value in allowed


PIPELINE_STEPS = [
    "parse",
    "combine",
    "highlight",
    "summarize",
    "template_map",
    "ppt_generate",
    "image_generate",
    "script_generate",
    "export",
]


class StepRecord:
    """Single step execution record."""

    __slots__ = ("name", "status", "start_ts", "end_ts", "latency_ms",
                 "error", "error_category", "metadata")

    def __init__(self, name: str):
        self.name = name
        self.status: StepStatus = StepStatus.PENDING
        self.start_ts: float = 0
        self.end_ts: float = 0
        self.latency_ms: float = 0
        self.error: str = ""
        self.error_category: ErrorCategory | None = None
        self.metadata: dict[str, Any] = {}

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "step": self.name,
            "status": self.status.value,
            "latency_ms": round(self.latency_ms, 2),
        }
        if self.start_ts:
            d["started_at"] = datetime.fromtimestamp(self.start_ts, tz=timezone.utc).isoformat()
        if self.end_ts:
            d["ended_at"] = datetime.fromtimestamp(self.end_ts, tz=timezone.utc).isoformat()
        if self.error:
            d["error"] = self.error[:500]
            d["error_category"] = self.error_category.value if self.error_category else ErrorCategory.UNKNOWN.value
        if self.metadata:
            d["metadata"] = self.metadata
        return d


def classify_error(step_name: str, exc: BaseException) -> ErrorCategory:
    """Classify an exception into an error category based on step and type."""
    exc_type = type(exc).__name__
    exc_msg = str(exc).lower()

    # Input errors
    if any(kw in exc_msg for kw in ("not found", "invalid", "missing", "empty", "no valid", "no selected")):
        return ErrorCategory.INPUT_ERROR
    if isinstance(exc, (ValueError, TypeError, KeyError, FileNotFoundError)):
        return ErrorCategory.INPUT_ERROR

    # Model errors (LLM / API)
    if any(kw in exc_msg for kw in ("api", "timeout", "rate limit", "deepseek", "aiohttp", "connection")):
        return ErrorCategory.MODEL_ERROR
    if step_name in ("summarize", "script_generate", "image_generate"):
        if "json" in exc_msg or "decode" in exc_msg:
            return ErrorCategory.MODEL_ERROR

    # Template errors
    if step_name in ("template_map", "ppt_generate") and any(kw in exc_msg for kw in ("template", "layout", "placeholder")):
        return ErrorCategory.TEMPLATE_ERROR

    # Render errors
    if step_name in ("ppt_generate", "image_generate", "export"):
        if any(kw in exc_msg for kw in ("render", "image", "picture", "pptx", "presentation")):
            return ErrorCategory.RENDER_ERROR

    return ErrorCategory.UNKNOWN


class TaskTracker:
    """
    Full-pipeline task tracker with step-level observability.

    Thread-safe for a single task (one tracker per request).
    """

    def __init__(self, *, request_id: str | None = None, user_id: str = "",
                 task_type: str = "ppt_pipeline"):
        self.request_id = request_id or uuid.uuid4().hex[:12]
        self.user_id = user_id
        self.task_type = task_type
        self.created_at = datetime.now(timezone.utc)
        self.steps: list[StepRecord] = []
        self._step_map: dict[str, StepRecord] = {}
        self._overall_start: float = time.perf_counter()
        self._finished = False
        self.overall_status: StepStatus = StepStatus.RUNNING
        self.result_metadata: dict[str, Any] = {}

    @contextmanager
    def step(self, name: str, **meta):
        """Context manager to time and track a pipeline step."""
        record = StepRecord(name)
        record.metadata = meta
        record.status = StepStatus.RUNNING
        record.start_ts = time.time()

        self.steps.append(record)
        self._step_map[name] = record

        logger.info("[%s] step '%s' started", self.request_id, name)
        try:
            yield record
            record.status = StepStatus.SUCCESS
        except Exception as exc:
            record.status = StepStatus.FAILED
            record.error = f"{type(exc).__name__}: {exc}"
            record.error_category = classify_error(name, exc)
            logger.error("[%s] step '%s' failed: %s [%s]",
                         self.request_id, name, record.error, record.error_category.value)
            raise
        finally:
            record.end_ts = time.time()
            record.latency_ms = (record.end_ts - record.start_ts) * 1000
            logger.info("[%s] step '%s' %s (%.0fms)",
                        self.request_id, name, record.status.value, record.latency_ms)

    def get_step(self, name: str) -> StepRecord | None:
        return self._step_map.get(name)

    def mark_skipped(self, name: str):
        """Mark a step as skipped (e.g., when resuming from checkpoint)."""
        record = StepRecord(name)
        record.status = StepStatus.SKIPPED
        self.steps.append(record)
        self._step_map[name] = record

    def finish(self, status: StepStatus | None = None):
        """Finalize the tracker. Auto-determines status if not provided."""
        self._finished = True
        if status:
            self.overall_status = status
        else:
            failed = [s for s in self.steps if s.status == StepStatus.FAILED]
            if failed:
                self.overall_status = StepStatus.FAILED
            else:
                self.overall_status = StepStatus.SUCCESS

    @property
    def total_latency_ms(self) -> float:
        return (time.perf_counter() - self._overall_start) * 1000

    def timeline(self) -> dict[str, Any]:
        """Produce a human-readable timeline of the task."""
        return {
            "request_id": self.request_id,
            "user_id": self.user_id,
            "created_by": self.user_id,
            "task_type": self.task_type,
            "status": self.overall_status.value,
            "total_latency_ms": round(self.total_latency_ms, 2),
            "created_at": self.created_at.isoformat(),
            "steps": [s.to_dict() for s in self.steps],
        }

    def to_doc(self) -> dict[str, Any]:
        """Produce a MongoDB-ready document."""
        return {
            "request_id": self.request_id,
            "user_id": self.user_id,
            "created_by": self.user_id,
            "task_type": self.task_type,
            "status": self.overall_status.value,
            "total_latency_ms": round(self.total_latency_ms, 2),
            "created_at": self.created_at,
            "finished_at": datetime.now(timezone.utc),
            "steps": [s.to_dict() for s in self.steps],
            "result_metadata": self.result_metadata,
        }

    async def save(self) -> None:
        """Persist the task record to MongoDB."""
        if not self._finished:
            self.finish()
        try:
            from backend.core.database import db
            await db["sub1_task_tracking"].insert_one(self.to_doc())
            logger.info("[%s] task record saved", self.request_id)
        except Exception:
            logger.exception("[%s] failed to save task record", self.request_id)

    @staticmethod
    async def get_stats(hours: int = 24, user_id: str | None = None) -> dict[str, Any]:
        """Aggregate pipeline stats for the last N hours."""
        from datetime import timedelta
        from backend.core.database import db

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        match_filter: dict[str, Any] = {"created_at": {"$gte": cutoff}}
        if user_id:
            match_filter["user_id"] = user_id

        pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": "$task_type",
                    "total_tasks": {"$sum": 1},
                    "successful": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                    "avg_latency_ms": {"$avg": "$total_latency_ms"},
                    "latencies": {"$push": "$total_latency_ms"},
                }
            },
        ]

        results = await db["sub1_task_tracking"].aggregate(pipeline).to_list(50)

        stats = {}
        for r in results:
            latencies = sorted(r.get("latencies", []))
            total = r["total_tasks"]
            p50 = latencies[len(latencies) // 2] if latencies else 0
            p95_idx = int(len(latencies) * 0.95)
            p95 = latencies[min(p95_idx, len(latencies) - 1)] if latencies else 0

            stats[r["_id"]] = {
                "total_tasks": total,
                "successful": r["successful"],
                "failed": r["failed"],
                "success_rate_pct": round(r["successful"] / total * 100, 1) if total else 0,
                "avg_latency_ms": round(r["avg_latency_ms"] or 0, 2),
                "p50_latency_ms": round(p50, 2),
                "p95_latency_ms": round(p95, 2),
            }

        # Step-level breakdown
        step_pipeline = [
            {"$match": match_filter},
            {"$unwind": "$steps"},
            {
                "$group": {
                    "_id": "$steps.step",
                    "total": {"$sum": 1},
                    "success": {"$sum": {"$cond": [{"$eq": ["$steps.status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$steps.status", "failed"]}, 1, 0]}},
                    "avg_latency_ms": {"$avg": "$steps.latency_ms"},
                    "latencies": {"$push": "$steps.latency_ms"},
                }
            },
        ]
        step_results = await db["sub1_task_tracking"].aggregate(step_pipeline).to_list(50)

        step_stats = {}
        for r in step_results:
            latencies = sorted(r.get("latencies", []))
            total = r["total"]
            p95_idx = int(len(latencies) * 0.95)
            step_stats[r["_id"]] = {
                "total": total,
                "success_rate_pct": round(r["success"] / total * 100, 1) if total else 0,
                "avg_latency_ms": round(r["avg_latency_ms"] or 0, 2),
                "p95_latency_ms": round(latencies[min(p95_idx, len(latencies) - 1)], 2) if latencies else 0,
            }

        # Error breakdown
        error_pipeline = [
            {"$match": match_filter},
            {"$unwind": "$steps"},
            {"$match": {"steps.status": "failed"}},
            {
                "$group": {
                    "_id": {
                        "step": "$steps.step",
                        "error_category": "$steps.error_category",
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1}},
        ]
        error_results = await db["sub1_task_tracking"].aggregate(error_pipeline).to_list(100)
        error_breakdown = [
            {"step": r["_id"]["step"], "category": r["_id"]["error_category"], "count": r["count"]}
            for r in error_results
        ]

        return {
            "period_hours": hours,
            "pipeline_stats": stats,
            "step_stats": step_stats,
            "error_breakdown": error_breakdown,
        }

    @staticmethod
    async def get_task(request_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Get a single task record by request_id."""
        from backend.core.database import db
        query: dict[str, Any] = {"request_id": request_id}
        if user_id:
            query["user_id"] = user_id
        doc = await db["sub1_task_tracking"].find_one(
            query,
            {"_id": 0}
        )
        return doc
