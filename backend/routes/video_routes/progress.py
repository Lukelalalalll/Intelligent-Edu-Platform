from __future__ import annotations

import asyncio
import json

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from backend.services.video_service import _tasks, get_script_job

from fastapi import APIRouter
router = APIRouter()


@router.get("/script-progress/{job_id}")
async def script_progress_sse(job_id: str):
    if get_script_job(job_id) is None:
        raise HTTPException(404, "Job not found")

    async def event_stream():
        while True:
            job = get_script_job(job_id)
            if not job:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Job not found'})}\n\n"
                break
            yield f"data: {json.dumps({'status': job['status'], 'progress': job['progress'], 'message': job['message']})}\n\n"
            if job["status"] in ("done", "error"):
                yield f"data: {json.dumps(job)}\n\n"
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/progress/{task_id}")
async def video_progress_sse(task_id: str):
    if task_id not in _tasks:
        raise HTTPException(404, "Task not found")

    async def event_stream():
        last_progress = -1
        while True:
            task = _tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Task evicted'})}\n\n"
                break

            status = task.get("status", "pending")
            progress = task.get("progress", 0)
            clip_errors = task.get("errors", [])
            payload: dict = {
                "type": "progress",
                "status": status,
                "progress": progress,
                "message": task.get("message", ""),
            }

            if status == "done":
                payload["type"] = "warn" if clip_errors else "done"
                payload["videoPath"] = task.get("videoPath", "")
                if task.get("thumbnailPath"):
                    payload["thumbnailPath"] = task["thumbnailPath"]
                if task.get("chaptersPath"):
                    payload["chaptersPath"] = task["chaptersPath"]
                if task.get("quizPath"):
                    payload["quizPath"] = task["quizPath"]
                if clip_errors:
                    payload["errors"] = clip_errors
                yield f"data: {json.dumps(payload)}\n\n"
                break

            if status == "error":
                payload["type"] = "error"
                payload["error"] = task.get("error", "Unknown error")
                if clip_errors:
                    payload["errors"] = clip_errors
                yield f"data: {json.dumps(payload)}\n\n"
                break

            if progress != last_progress:
                yield f"data: {json.dumps(payload)}\n\n"
                last_progress = progress

            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
