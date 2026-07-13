"""Shared router instance and per-task session helpers."""
from __future__ import annotations

from fastapi import APIRouter, Request

questions_router = APIRouter(prefix="/questions", tags=["Question Generator"])


def _get_task(request: Request, task_id: str) -> dict | None:
    """Retrieve a sub2 task dict from session by task_id."""
    tasks = request.session.get('sub2_tasks', {})
    return tasks.get(task_id)


def _set_task(request: Request, task_id: str, data: dict):
    """Store or update a sub2 task dict in session."""
    tasks = request.session.get('sub2_tasks', {})
    # Limit stored tasks to prevent session bloat (keep latest 5)
    if len(tasks) >= 5 and task_id not in tasks:
        oldest_key = next(iter(tasks))
        tasks.pop(oldest_key, None)
    tasks[task_id] = data
    request.session['sub2_tasks'] = tasks
