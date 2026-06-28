import asyncio
import time
import uuid
from typing import Any


class PptGeneratorTaskService:
    _tasks: dict[str, dict[str, Any]] = {}
    _lock = asyncio.Lock()

    @classmethod
    async def create_task(cls, request_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        task_id = uuid.uuid4().hex
        now = time.time()
        task = {
            "task_id": task_id,
            "request_id": request_id,
            "status": "queued",
            "current_step": "queued",
            "progress": 0,
            "result": None,
            "error": "",
            "events": [
                {
                    "type": "step_start",
                    "step": "queued",
                    "message": "Task queued",
                    "ts": now,
                }
            ],
            "created_at": now,
            "updated_at": now,
            "meta": meta or {},
        }
        async with cls._lock:
            cls._tasks[task_id] = task
        return task

    @classmethod
    async def add_event(
        cls,
        task_id: str,
        event_type: str,
        step: str,
        message: str,
        progress: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        now = time.time()
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return
            event = {
                "type": event_type,
                "step": step,
                "message": message,
                "ts": now,
            }
            if payload:
                event["payload"] = payload
            task["events"].append(event)
            task["current_step"] = step
            if progress is not None:
                task["progress"] = max(0, min(100, int(progress)))
            task["updated_at"] = now

    @classmethod
    async def set_status(cls, task_id: str, status: str, progress: int | None = None) -> None:
        now = time.time()
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return
            task["status"] = status
            if progress is not None:
                task["progress"] = max(0, min(100, int(progress)))
            task["updated_at"] = now

    @classmethod
    async def complete(cls, task_id: str, result: dict[str, Any]) -> None:
        await cls.add_event(task_id, "step_done", "complete", "Generation completed", progress=100)
        now = time.time()
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return
            task["status"] = "completed"
            task["current_step"] = "complete"
            task["progress"] = 100
            task["result"] = result
            task["updated_at"] = now

    @classmethod
    async def fail(cls, task_id: str, error_message: str, step: str = "failed") -> None:
        await cls.add_event(task_id, "step_error", step, error_message)
        now = time.time()
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return
            task["status"] = "failed"
            task["current_step"] = step
            task["error"] = error_message
            task["updated_at"] = now

    @classmethod
    async def get_task(cls, task_id: str) -> dict[str, Any] | None:
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return None
            return dict(task)

    @classmethod
    async def get_events_since(cls, task_id: str, start_index: int) -> tuple[list[dict[str, Any]], int, str]:
        async with cls._lock:
            task = cls._tasks.get(task_id)
            if not task:
                return [], start_index, "failed"
            events = task.get("events", [])
            if start_index < 0:
                start_index = 0
            chunk = events[start_index:]
            next_index = len(events)
            return chunk, next_index, task.get("status", "failed")

