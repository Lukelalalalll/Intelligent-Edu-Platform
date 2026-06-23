from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.core.security import get_current_user
from backend.schemas import SlidesGenerateV2Schema
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro

router = APIRouter()


def _delivery_module():
    from . import delivery as delivery_module

    return delivery_module


def _schema_dump(req: SlidesGenerateV2Schema) -> dict:
    if hasattr(req, "model_dump"):
        return req.model_dump()
    return req.dict()


async def _run_generate_v2_dispatch_job(
    dispatch_job_id: str,
    task_id: str,
    req: SlidesGenerateV2Schema,
    runtime,
    user: dict | None = None,
) -> None:
    delivery_module = _delivery_module()
    worker_id = f"api-slides-generate-v2-{task_id}"
    claimed = await background_job_dispatcher.claim(
        worker_id=worker_id,
        job_types=[delivery_module.SLIDES_GENERATE_V2_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=900,
    )
    if not claimed:
        return

    await delivery_module._run_generate_v2_task(task_id, req, runtime, user=user)
    task = await delivery_module.PresentonTaskService.get_task(task_id)
    if (task or {}).get("status") == "completed":
        await background_job_dispatcher.mark_done(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            result={"task_id": task_id, "status": "completed"},
        )
        return

    await background_job_dispatcher.mark_failed(
        job_id=dispatch_job_id,
        worker_id=worker_id,
        error=str((task or {}).get("error") or "Slides generate_v2 task failed"),
    )


@router.post("/generate_v2")
async def generate_v2(
    req: SlidesGenerateV2Schema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    delivery_module = _delivery_module()
    request_id = (request.headers.get("X-Request-ID") if request else None) or uuid.uuid4().hex
    runtime = await delivery_module._resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.generate_v2",
        user=user,
        require_healthy=True,
    )
    task = await delivery_module.PresentonTaskService.create_task(
        request_id=request_id,
        meta={
            "provider_requested": runtime.requested_provider,
            "provider": runtime.provider_id,
            "provider_source": runtime.config_source,
            "model": runtime.model,
            "requested_pages": req.total_pages,
            "generate_talking_script": req.generate_talking_script,
            "theme": req.theme or "",
        },
    )
    dispatch_job = await background_job_dispatcher.enqueue(
        job_type=delivery_module.SLIDES_GENERATE_V2_JOB_TYPE,
        payload={
            "task_id": task["task_id"],
            "request_id": request_id,
            "provider": runtime.provider_id,
            "provider_requested": runtime.requested_provider,
            "provider_source": runtime.config_source,
            "model": runtime.model,
            "request": _schema_dump(req),
        },
        metadata={"task_id": task["task_id"], "request_id": request_id},
    )
    await delivery_module.PresentonTaskService.add_event(
        task["task_id"],
        "step_progress",
        "queued",
        "Background job enqueued",
        progress=2,
        payload={"dispatch_job_id": dispatch_job["job_id"]},
    )
    spawn_background_coro(
        _run_generate_v2_dispatch_job(dispatch_job["job_id"], task["task_id"], req, runtime, user=user),
        label=f"slides-generate-v2:{task['task_id']}",
    )
    return {
        "success": True,
        "task_id": task["task_id"],
        "status": task["status"],
        "request_id": request_id,
    }


@router.get("/tasks/{task_id}")
async def get_generate_v2_task(task_id: str, user: dict = Depends(get_current_user)):
    delivery_module = _delivery_module()
    task = await delivery_module.PresentonTaskService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "success": True,
        "task_id": task["task_id"],
        "status": task["status"],
        "current_step": task.get("current_step", ""),
        "progress": task.get("progress", 0),
        "request_id": task.get("request_id", ""),
        "result": task.get("result"),
        "error": task.get("error", ""),
        "events": task.get("events", []),
    }


@router.get("/tasks/{task_id}/stream")
async def stream_generate_v2_task(task_id: str, user: dict = Depends(get_current_user)):
    delivery_module = _delivery_module()
    task = await delivery_module.PresentonTaskService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    async def event_stream():
        index = 0
        while True:
            events, index, status = await delivery_module.PresentonTaskService.get_events_since(task_id, index)
            for event in events:
                payload = json.dumps(event, ensure_ascii=False)
                yield f"event: {event.get('type', 'step_progress')}\n"
                yield f"data: {payload}\n\n"
            if status in ("completed", "failed"):
                final_payload = json.dumps({"type": "done", "status": status}, ensure_ascii=False)
                yield "event: done\n"
                yield f"data: {final_payload}\n\n"
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
