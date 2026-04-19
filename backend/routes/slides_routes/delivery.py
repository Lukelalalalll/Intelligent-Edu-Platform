"""Presenton delivery routes: jobs, generate_v2, task streaming, provider health."""
import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import db
from backend.core.security import get_current_user
from backend.schemas import SlidesGenerateV2Schema
from backend.services.slides import (
    PresentonAdapterService,
    PresentonTaskService,
    ChapterSummarizer,
    generate_talking_script_word,
)
from .router import slides_router, SlidesDeliveryJobSchema

logger = logging.getLogger(__name__)


@slides_router.post("/delivery/jobs")
async def create_slides_delivery_job(
    payload: SlidesDeliveryJobSchema,
    user: dict = Depends(get_current_user),
):
    slides = payload.ppt_schema.get("slides", []) if isinstance(payload.ppt_schema, dict) else []
    if not slides:
        raise HTTPException(status_code=400, detail="ppt_schema.slides is required")

    now = datetime.now(timezone.utc)
    job_id = uuid.uuid4().hex[:14]

    agenda, speaker_notes, in_class_questions, homework = [], [], [], []
    for idx, slide in enumerate(slides, start=1):
        title = str(slide.get("title") or f"Slide {idx}")
        agenda.append(f"{idx}. {title}")
        speaker_notes.append({
            "slide": idx,
            "title": title,
            "note": f"Explain the core idea of '{title}' in 60-90 seconds, then connect it to the previous point.",
        })
        in_class_questions.append({
            "slide": idx,
            "question": f"What is the most important takeaway from '{title}'?",
            "expected_depth": "short_reasoning",
        })
        homework.append({
            "task_id": f"HW-{idx}",
            "prompt": f"Write a concise reflection on '{title}' and include one practical example.",
            "estimated_minutes": 12,
        })

    artifacts = {
        "agenda": agenda,
        "speaker_notes": speaker_notes,
        "in_class_questions": in_class_questions,
        "homework_suggestions": homework,
    }
    doc = {
        "job_id": job_id,
        "user_id": str(user.get("id", "")),
        "title": payload.title,
        "status": "completed",
        "locale": payload.locale,
        "script_style": payload.script_style,
        "slides_count": len(slides),
        "artifacts": artifacts,
        "created_at": now,
        "updated_at": now,
    }
    await db.slides_delivery_jobs.insert_one(doc)
    return {
        "success": True,
        "job_id": job_id,
        "status": "completed",
        "slides_count": len(slides),
        "artifacts_preview": {
            "agenda_count": len(agenda),
            "speaker_notes_count": len(speaker_notes),
            "in_class_questions_count": len(in_class_questions),
            "homework_count": len(homework),
        },
    }


async def _run_generate_v2_task(task_id: str, req: SlidesGenerateV2Schema, resolved_provider: str):
    try:
        adapter = PresentonAdapterService(provider=resolved_provider)
        await PresentonTaskService.set_status(task_id, "running", progress=5)

        await PresentonTaskService.add_event(task_id, "step_start", "provider_health",
                                             f"Checking provider health ({resolved_provider})", progress=10)
        healthy, message = await adapter.check_provider_health()
        if not healthy:
            raise RuntimeError(f"Provider health check failed: {message}")
        await PresentonTaskService.add_event(task_id, "step_done", "provider_health",
                                             "Provider is healthy", progress=18)

        import re as _re

        def _strip_html(html_text: str) -> str:
            """Remove HTML tags and collapse whitespace for clean LLM input."""
            if not html_text:
                return ""
            clean = _re.sub(r'<[^>]+>', ' ', str(html_text))
            clean = _re.sub(r'\s+', ' ', clean)
            return clean.strip()

        source_text = (req.content or "").strip()
        chapter_data_clean: list[dict] = []
        if not source_text and req.chapterData:
            chapter_data_clean = [
                {
                    "sectionTitle": item.get("sectionTitle", f"Chapter {idx + 1}"),
                    "text": _strip_html(item.get("text", "")),
                }
                for idx, item in enumerate(req.chapterData)
                if isinstance(item, dict)
            ]
            source_text = "\n\n".join(
                f"{c['sectionTitle']}\n{c['text']}"
                for c in chapter_data_clean
            )
        if not source_text:
            raise RuntimeError("content or chapterData is required")

        pages = max(1, min(int(req.total_pages or 8), 40))
        bullets = max(1, min(int(req.num_of_bullets or 3), 6))
        words = max(8, min(int(req.words_each_bullet or 15), 80))

        await PresentonTaskService.add_event(task_id, "step_start", "outline",
                                             "Generating outline", progress=25)
        outline = await adapter.generate_outline(
            source_text=source_text, total_pages=pages, chapter_data=chapter_data_clean
        )
        await PresentonTaskService.add_event(task_id, "step_done", "outline",
                                             f"Outline generated with {len(outline)} slides", progress=45)

        await PresentonTaskService.add_event(task_id, "step_start", "slide_content",
                                             "Generating slide content", progress=55)
        slides_results = await adapter.generate_slides(outline=outline, num_of_bullets=bullets,
                                                       words_each_bullet=words)
        await PresentonTaskService.add_event(task_id, "step_done", "slide_content",
                                             f"Generated content for {len(slides_results)} slides", progress=78)

        title = (req.presentation_title or "").strip() or "Generated Presentation"
        ppt_schema = {
            "presentation_title": title,
            "slides": [{**slide, "tables": slide.get("tables") or []} for slide in slides_results],
            "metadata": {
                "provider": resolved_provider,
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
        }

        script_payload = None
        if req.generate_talking_script:
            await PresentonTaskService.add_event(task_id, "step_start", "script",
                                                 "Generating talking script", progress=84)
            summarizer = ChapterSummarizer()
            scripts = await summarizer.generate_talking_script(slides_results, req.script_style,
                                                               provider=resolved_provider)
            import os
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"talking_script_{timestamp}.docx"
            output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            generate_talking_script_word(scripts, output_path, title)

            script_payload = {
                "total_scripts": len(scripts),
                "estimated_total_duration": f"{len(scripts) * 2} minutes",
            }
            if req.generate_word_document:
                script_payload["word_document"] = {
                    "available": True,
                    "filename": filename,
                    "download_url": f"/slides/download_script/{filename}",
                }
            await PresentonTaskService.add_event(task_id, "step_done", "script",
                                                 "Talking script generated", progress=92)

        await PresentonTaskService.add_event(task_id, "step_done", "complete",
                                             "Packaging response", progress=98)

        result = {"status": "success", "results": slides_results, "ppt_schema": ppt_schema,
                  "provider": resolved_provider}
        if script_payload:
            result.update(script_payload)
        await PresentonTaskService.complete(task_id, result)

    except Exception as e:  # noqa: BLE001
        logger.exception("[slides.generate_v2][%s] failed", task_id)
        await PresentonTaskService.fail(task_id, str(e), step="generate_v2")


@slides_router.post("/generate_v2")
async def generate_v2(
    req: SlidesGenerateV2Schema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None) or uuid.uuid4().hex
    resolved_provider = resolve_provider(req.provider, feature="slides.generate_v2", user=user)
    task = await PresentonTaskService.create_task(
        request_id=request_id,
        meta={
            "provider": resolved_provider,
            "requested_pages": req.total_pages,
            "generate_talking_script": req.generate_talking_script,
        },
    )
    asyncio.create_task(_run_generate_v2_task(task["task_id"], req, resolved_provider))
    return {"success": True, "task_id": task["task_id"], "status": task["status"],
            "request_id": request_id}


@slides_router.get("/tasks/{task_id}")
async def get_generate_v2_task(task_id: str, user: dict = Depends(get_current_user)):
    task = await PresentonTaskService.get_task(task_id)
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


@slides_router.get("/tasks/{task_id}/stream")
async def stream_generate_v2_task(task_id: str, user: dict = Depends(get_current_user)):
    task = await PresentonTaskService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    async def event_stream():
        index = 0
        while True:
            events, index, status = await PresentonTaskService.get_events_since(task_id, index)
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


@slides_router.get("/provider-health")
async def slides_provider_health(
    provider: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    resolved_provider = resolve_provider(provider, feature="slides.provider_health", user=user)
    adapter = PresentonAdapterService(provider=resolved_provider)
    healthy, message = await adapter.check_provider_health()
    return {"success": healthy, "provider": resolved_provider, "message": message}


@slides_router.get("/delivery/jobs/{job_id}")
async def get_slides_delivery_job(job_id: str, user: dict = Depends(get_current_user)):
    doc = await db.slides_delivery_jobs.find_one(
        {"job_id": job_id, "user_id": str(user.get("id", ""))},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Slides delivery job not found")
    for key in ("created_at", "updated_at"):
        if hasattr(doc.get(key), "isoformat"):
            doc[key] = doc[key].isoformat()
    return {"success": True, "job": doc}


@slides_router.get("/delivery/jobs/{job_id}/artifact/{artifact_type}")
async def get_slides_delivery_artifact(
    job_id: str, artifact_type: str, user: dict = Depends(get_current_user)
):
    doc = await db.slides_delivery_jobs.find_one(
        {"job_id": job_id, "user_id": str(user.get("id", ""))},
        {"_id": 0, "artifacts": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Slides delivery job not found")
    artifacts = doc.get("artifacts", {})
    if artifact_type not in artifacts:
        raise HTTPException(status_code=404, detail="Artifact type not found")
    return {"success": True, "job_id": job_id, "artifact_type": artifact_type,
            "data": artifacts.get(artifact_type)}
