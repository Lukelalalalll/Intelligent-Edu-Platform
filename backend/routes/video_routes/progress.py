from __future__ import annotations

import asyncio
import json

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.core.security import get_current_user
from backend.services.video_service.project_service import VideoProjectService
from backend.services.video_service.script_job_service import VideoScriptJobService

from fastapi import APIRouter
router = APIRouter()


@router.get("/script-progress/{job_id}")
async def script_progress_sse(job_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or "")
    job = await VideoScriptJobService.get_job(job_id, user_id=user_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    async def event_stream():
        while True:
            job = await VideoScriptJobService.get_job(job_id, user_id=user_id)
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
async def video_progress_sse(task_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or "")
    status = await VideoProjectService.get_compat_status(task_id, user_id=user_id)
    if status is None:
        raise HTTPException(404, "Task not found")

    async def event_stream():
        last_index = 0
        while True:
            project = await VideoProjectService.get_project_doc(task_id, user_id=user_id)
            if not project:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Task evicted'})}\n\n"
                break

            compat = await VideoProjectService.get_compat_status(task_id, user_id=user_id)
            if not compat:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Task evicted'})}\n\n"
                break

            status = compat.get("status", "pending")
            progress = compat.get("progress", 0)
            clip_errors = compat.get("errors", [])
            payload: dict = {
                "type": "progress",
                "status": status,
                "progress": progress,
                "message": compat.get("message", ""),
            }

            if status == "done":
                payload["type"] = "warn" if clip_errors else "done"
                payload["videoPath"] = compat.get("videoPath", "")
                if compat.get("thumbnailPath"):
                    payload["thumbnailPath"] = compat["thumbnailPath"]
                if compat.get("chaptersPath"):
                    payload["chaptersPath"] = compat["chaptersPath"]
                if compat.get("quizPath"):
                    payload["quizPath"] = compat["quizPath"]
                if clip_errors:
                    payload["errors"] = clip_errors
                yield f"data: {json.dumps(payload)}\n\n"
                break

            if status == "error":
                payload["type"] = "error"
                payload["error"] = compat.get("error", "Unknown error")
                if clip_errors:
                    payload["errors"] = clip_errors
                yield f"data: {json.dumps(payload)}\n\n"
                break

            events, next_index, _ = await VideoProjectService.get_events_since(task_id, user_id=user_id, start_index=last_index)
            last_index = next_index
            if events or progress:
                yield f"data: {json.dumps(payload)}\n\n"

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


@router.get("/projects/{project_id}/stream")
async def stream_video_project(project_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user.get("id") or "")
    project = await VideoProjectService.get_project_doc(project_id, user_id=user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def event_stream():
        index = 0
        while True:
            events, index, status = await VideoProjectService.get_events_since(project_id, user_id=user_id, start_index=index)
            for event in events:
                payload = json.dumps(event, ensure_ascii=False)
                yield f"event: {event.get('type', 'step_progress')}\n"
                yield f"data: {payload}\n\n"
            if status in {"completed", "failed"}:
                final = await VideoProjectService.get_project(project_id, user_id=user_id)
                payload = json.dumps({"type": "done", "status": status, "project": final}, ensure_ascii=False)
                yield "event: done\n"
                yield f"data: {payload}\n\n"
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
