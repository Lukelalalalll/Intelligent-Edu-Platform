"""Presenton delivery routes: jobs, generate_v2, task streaming, provider health."""
import json
import uuid
import logging
import asyncio
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from fastapi import HTTPException, Depends, Request
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

from backend.config import Config
from backend.core.ai_provider import (
    check_runtime_health,
    list_provider_statuses,
    resolve_provider_runtime,
)
from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas import (
    PresentonAssistantMessageSchema,
    PresentonOutlineRequestSchema,
    SlidesGenerateV2Schema,
)
from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro
from backend.services.history_service import save_history_record
from backend.services.slides_delivery_service import (
    create_delivery_job,
    get_delivery_artifact,
    get_delivery_job,
)
from backend.services.slides import (
    PresentonAdapterService,
    PresentonTaskService,
    ChapterSummarizer,
    generate_talking_script_word,
)
from backend.services.slides_pipeline_service import create_ppt as create_ppt_from_schema
from backend.services.slides.svg_pipeline import build_svg_deck
from .router import slides_router, SlidesDeliveryJobSchema

logger = logging.getLogger(__name__)
SLIDES_GENERATE_V2_JOB_TYPE = "slides.generate_v2"


async def _resolve_presenton_runtime(
    requested: str | None,
    *,
    feature: str,
    user: dict | None,
    require_healthy: bool = False,
):
    raw_provider = str(requested or "auto").strip().lower()
    if raw_provider != "auto":
        return await resolve_provider_runtime(
            raw_provider,
            feature=feature,
            user=user,
            require_healthy=require_healthy,
        )

    if user:
        preferred_candidates = ("openai", "deepseek")
        for candidate in preferred_candidates:
            try:
                runtime = await resolve_provider_runtime(
                    candidate,
                    feature=feature,
                    user=user,
                    require_healthy=False,
                )
            except HTTPException:
                continue
            configured = bool(runtime.health_status.get("configured"))
            if not configured:
                continue
            if require_healthy:
                healthy, message = await check_runtime_health(runtime)
                runtime.health_status = {
                    "healthy": healthy,
                    "message": message,
                    "configured": configured,
                }
                if healthy:
                    return runtime
                continue
            return runtime

    return await resolve_provider_runtime(
        "auto",
        feature=feature,
        user=user,
        require_healthy=require_healthy,
    )


async def _save_presenton_history(
    *,
    user_id: str,
    params: dict,
    result_preview: str,
    result_full: dict,
    source: dict,
) -> None:
    await save_history_record(
        tool="slides",
        user_id=user_id,
        tool_name="presenton_generate_v2",
        params=params,
        result_preview=result_preview,
        result_full=result_full,
        source=source,
        expires_at=await compute_history_expires_at(user_id),
    )


def _attach_pptx_export(deck_manifest: dict, pptx_filename: str) -> dict:
    exports = {
        "pptx": {
            "available": True,
            "kind": "native_pptx",
            "source": "ppt_schema",
            "filename": pptx_filename,
            "download_url": f"/api/slides/download_ppt/{pptx_filename}",
        }
    }
    deck_manifest["exports"] = exports
    manifest_path = Path(Config.PPT_RESULTS_FOLDER) / "svg_decks" / deck_manifest["deck_id"] / "manifest.json"
    manifest_path.write_text(json.dumps(deck_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return exports


def _to_iso(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return None


def _strip_html(html_text: str) -> str:
    if not html_text:
        return ""
    clean = re.sub(r"<[^>]+>", " ", str(html_text))
    clean = re.sub(r"\s+", " ", clean)
    return clean.strip()


def _extract_source_text_and_chapters(
    content: str,
    chapter_data: list[dict[str, Any]] | None,
) -> tuple[str, list[dict[str, str]]]:
    source_text = (content or "").strip()
    chapter_data_clean: list[dict[str, str]] = []
    if not source_text and chapter_data:
        chapter_data_clean = [
            {
                "sectionTitle": str(item.get("sectionTitle") or f"Chapter {idx + 1}"),
                "text": _strip_html(str(item.get("text") or "")),
            }
            for idx, item in enumerate(chapter_data)
            if isinstance(item, dict)
        ]
        source_text = "\n\n".join(
            f"{chapter['sectionTitle']}\n{chapter['text']}"
            for chapter in chapter_data_clean
        ).strip()
    return source_text, chapter_data_clean


def _coerce_outline_points(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    values = [str(item).strip() for item in value if str(item).strip()]
    deduped: list[str] = []
    for value_text in values:
        if value_text not in deduped:
            deduped.append(value_text)
    return deduped[:5]


def _outline_to_markdown(item: dict[str, Any], slide_number: int) -> str:
    title = str(item.get("title") or f"Slide {slide_number}").strip()
    objective = str(item.get("objective") or "").strip()
    key_points = _coerce_outline_points(item.get("key_points"))
    lines = [f"# {title}"]
    if objective:
        lines.extend(["", f"Objective: {objective}"])
    if key_points:
        lines.append("")
        lines.extend([f"- {point}" for point in key_points])
    return "\n".join(lines).strip()


def _extract_outline_title(text: str, slide_number: int) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return f"Slide {slide_number}"
    candidate = re.sub(r"^[#*\-\d\.\)\s]+", "", lines[0]).strip()
    return candidate or f"Slide {slide_number}"


def _normalize_outline_slide(item: dict[str, Any], slide_number: int) -> dict[str, Any]:
    if not isinstance(item, dict):
        item = {}

    explicit_title = str(item.get("title") or "").strip()
    explicit_objective = str(item.get("objective") or "").strip()
    explicit_key_points = _coerce_outline_points(item.get("key_points"))
    raw_content = str(item.get("content") or "").strip()

    title = explicit_title or _extract_outline_title(raw_content, slide_number)
    objective = explicit_objective
    key_points = explicit_key_points

    if raw_content:
        bullet_points: list[str] = []
        candidate_lines: list[str] = []
        for raw_line in raw_content.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            bullet_match = re.match(r"^(?:[-*+]\s+|\d+[\.\)]\s+)(.+)$", line)
            if bullet_match:
                bullet_points.append(bullet_match.group(1).strip())
                continue
            if line.lower().startswith("objective:"):
                objective = objective or line.split(":", 1)[1].strip()
                continue
            if line.startswith("#"):
                continue
            candidate_lines.append(line)

        if not objective and candidate_lines:
            objective = candidate_lines[0]
        if not key_points:
            key_points = bullet_points
        if not key_points:
            key_points = [
                segment.strip()
                for segment in re.split(r"[。.!！？?\n]+", raw_content)
                if len(segment.strip()) > 4
            ][:4]

    if not objective:
        objective = f"Explain: {title}"
    if not key_points:
        key_points = ["Core concept", "Why it matters", "Practical takeaway"]

    normalized = {
        "title": title,
        "objective": objective,
        "key_points": key_points[:5],
    }
    normalized["content"] = raw_content or _outline_to_markdown(normalized, slide_number)
    return normalized


def _normalize_outline_slides(items: list[dict[str, Any]] | None, fallback_total_pages: int) -> list[dict[str, Any]]:
    normalized = [
        _normalize_outline_slide(item, idx + 1)
        for idx, item in enumerate(items or [])
        if isinstance(item, dict)
    ]
    if normalized:
        return normalized
    return [_normalize_outline_slide({}, idx + 1) for idx in range(max(1, fallback_total_pages))]


def _build_presenton_assistant_prompt(req: PresentonAssistantMessageSchema) -> str:
    title = (req.presentation_title or "").strip() or "Untitled Presentation"
    history_lines: list[str] = []
    for message in req.history[-8:]:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user").strip() or "user"
        content = str(message.get("content") or "").strip()
        if content:
            history_lines.append(f"{role.title()}: {content}")

    slide_lines: list[str] = []
    for idx, slide in enumerate(req.slides[:20], start=1):
        if not isinstance(slide, dict):
            continue
        slide_title = str(slide.get("title") or f"Slide {idx}").strip()
        objective = str(slide.get("objective") or "").strip()
        bullets = slide.get("content") if isinstance(slide.get("content"), list) else slide.get("key_points")
        bullet_text = "; ".join(str(item).strip() for item in (bullets or []) if str(item).strip())
        parts = [f"{idx}. {slide_title}"]
        if objective:
            parts.append(f"Objective: {objective}")
        if bullet_text:
            parts.append(f"Bullets: {bullet_text}")
        slide_lines.append(" | ".join(parts))

    current_slide_index = req.current_slide_index if req.current_slide_index is not None else 0
    current_slide_title = str(req.current_slide_title or "").strip() or f"Slide {current_slide_index + 1}"
    current_slide_content = "; ".join(
        str(item).strip() for item in (req.current_slide_content or []) if str(item).strip()
    )
    conversation = "\n".join(history_lines) if history_lines else "No prior conversation."
    deck_context = "\n".join(slide_lines) if slide_lines else "No deck content available yet."

    return (
        "You are Presenton AI Assistant inside a presentation editing workspace. "
        "Help the user improve the deck, answer questions about structure and wording, "
        "and stay grounded in the current presentation. Be concise, practical, and specific.\n\n"
        f"Presentation title: {title}\n"
        f"Current slide: {current_slide_index + 1} - {current_slide_title}\n"
        f"Current slide bullets: {current_slide_content or 'No bullet content provided'}\n\n"
        f"Deck context:\n{deck_context}\n\n"
        f"Conversation so far:\n{conversation}\n\n"
        f"User request:\n{req.message.strip()}"
    )


def _build_presenton_source(req: SlidesGenerateV2Schema, *, title: str, request_id: str) -> dict:
    source_kind = (req.source_kind or "").strip() or "text"
    source_filename = str(req.source_filename or "").strip()
    source_display_name = str(req.source_display_name or "").strip()
    combined_filename = str(req.combined_markdown_filename or "").strip()
    source: dict[str, object] = {
        "kind": source_kind,
        "title": title,
        "request_id": request_id,
    }
    if source_filename:
        source["source_filename"] = source_filename
        source["source_download_url"] = f"/api/slides/download_source/{source_filename}"
    if source_display_name:
        source["source_display_name"] = source_display_name
    if combined_filename:
        source["combined_markdown_filename"] = combined_filename
        source["combined_markdown_download_url"] = f"/api/slides/download/{combined_filename}"
    return source


def _build_presenton_result_artifacts(
    *,
    title: str,
    request_id: str,
    slides_results: list[dict] | None,
    pptx_filename: str = "",
    design_spec_url: str = "",
    script_payload: dict | None = None,
) -> dict:
    result: dict[str, object] = {
        "request_id": request_id,
        "title": title,
        "page_count": len(slides_results or []),
        "pptx_filename": pptx_filename,
        "pptx_download_url": f"/api/slides/download_ppt/{pptx_filename}" if pptx_filename else "",
        "html_preview_filename": "",
        "html_preview_url": "",
    }
    if design_spec_url:
        result["design_spec_url"] = design_spec_url
    if script_payload and isinstance(script_payload.get("word_document"), dict):
        word_document = script_payload["word_document"]
        result["script_doc_filename"] = word_document.get("filename", "")
        result["script_doc_download_url"] = word_document.get("download_url", "")
    return result


def _build_workflow_snapshot(task: dict | None, *, task_type: str = "presenton_generate_v2") -> dict | None:
    if not isinstance(task, dict):
        return None
    events = task.get("events") or []
    if not isinstance(events, list):
        events = []
    steps_map: dict[str, dict] = {}
    ordered_steps: list[str] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        step_name = str(event.get("step") or "").strip() or "unknown"
        ts = event.get("ts")
        entry = steps_map.get(step_name)
        if entry is None:
            entry = {
                "step": step_name,
                "status": "running",
                "latency_ms": 0,
                "started_at": _to_iso(ts),
                "ended_at": _to_iso(ts),
                "metadata": {},
            }
            steps_map[step_name] = entry
            ordered_steps.append(step_name)
        if ts is not None:
            if not entry.get("started_at"):
                entry["started_at"] = _to_iso(ts)
            entry["ended_at"] = _to_iso(ts)
            started_dt = entry.get("started_at")
            ended_dt = entry.get("ended_at")
            if started_dt and ended_dt:
                try:
                    start_ts = datetime.fromisoformat(started_dt).timestamp()
                    end_ts = datetime.fromisoformat(ended_dt).timestamp()
                    entry["latency_ms"] = max(0, round((end_ts - start_ts) * 1000))
                except Exception:
                    pass
        event_type = str(event.get("type") or "")
        message = str(event.get("message") or "")
        payload = event.get("payload")
        metadata = entry.setdefault("metadata", {})
        if message:
            metadata["message"] = message
        if isinstance(payload, dict) and payload:
            metadata.update(payload)
        if event_type == "step_done":
            entry["status"] = "success"
        elif event_type == "step_error":
            entry["status"] = "failed"
            if message:
                entry["error"] = message
        elif event_type == "step_progress" and entry.get("status") != "success":
            entry["status"] = "running"

    created_at = _to_iso(task.get("created_at"))
    updated_at = _to_iso(task.get("updated_at"))
    total_latency_ms = None
    if task.get("created_at") is not None and task.get("updated_at") is not None:
        try:
            total_latency_ms = max(0, round((float(task["updated_at"]) - float(task["created_at"])) * 1000))
        except Exception:
            total_latency_ms = None

    return {
        "request_id": task.get("request_id"),
        "task_id": task.get("task_id"),
        "task_type": task_type,
        "status": task.get("status"),
        "created_at": created_at,
        "updated_at": updated_at,
        "total_latency_ms": total_latency_ms,
        "steps": [steps_map[name] for name in ordered_steps],
    }


def _build_presenton_history_params(
    *,
    req: SlidesGenerateV2Schema,
    runtime,
    request_id: str,
    task_id: str,
    deck_id: str = "",
    title: str = "",
) -> dict:
    return {
        "tool": "presenton_generate_v2",
        "provider": req.provider or "auto",
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "model": runtime.model,
        "title": title,
        "presentation_title": title,
        "total_pages": req.total_pages,
        "num_of_bullets": req.num_of_bullets,
        "words_each_bullet": req.words_each_bullet,
        "generate_talking_script": req.generate_talking_script,
        "generate_word_document": req.generate_word_document,
        "script_style": req.script_style,
        "theme": req.theme or "",
        "source_kind": req.source_kind or "text",
        "source_filename": req.source_filename or "",
        "source_display_name": req.source_display_name or "",
        "combined_markdown_filename": req.combined_markdown_filename or "",
        "request_id": request_id,
        "task_id": task_id,
        "deck_id": deck_id,
    }


async def _persist_generate_v2_history(
    *,
    user_id: str,
    task: dict | None,
    req: SlidesGenerateV2Schema,
    runtime,
    title: str,
    result: dict,
    slides_results: list[dict] | None = None,
    pptx_filename: str = "",
    design_spec_url: str = "",
    script_payload: dict | None = None,
) -> None:
    request_id = str((task or {}).get("request_id") or "")
    task_id = str((task or {}).get("task_id") or "")
    workflow = _build_workflow_snapshot(task)
    source = _build_presenton_source(req, title=title, request_id=request_id)
    source["workflow"] = workflow
    source["result_artifacts"] = _build_presenton_result_artifacts(
        title=title,
        request_id=request_id,
        slides_results=slides_results,
        pptx_filename=pptx_filename,
        design_spec_url=design_spec_url,
        script_payload=script_payload,
    )
    params = _build_presenton_history_params(
        req=req,
        runtime=runtime,
        request_id=request_id,
        task_id=task_id,
        deck_id=str(result.get("deck_id") or ""),
        title=title,
    )
    preview = str(result.get("error") or "").strip()
    if not preview:
        page_count = source["result_artifacts"].get("page_count", 0) if isinstance(source.get("result_artifacts"), dict) else 0
        preview = f"Presenton generated {page_count} slides with {runtime.provider_id}"
    await _save_presenton_history(
        user_id=user_id,
        params=params,
        result_preview=preview,
        result_full=result,
        source=source,
    )


@slides_router.post("/delivery/jobs")
async def create_slides_delivery_job(
    payload: SlidesDeliveryJobSchema,
    user: dict = Depends(get_current_user),
):
    return await create_delivery_job(payload=payload, user=user)


async def _run_generate_v2_task(task_id: str, req: SlidesGenerateV2Schema, runtime, user: dict | None = None):
    title = (req.presentation_title or "").strip() or "Generated Presentation"
    selected_theme = str(req.theme or "").strip()
    pptx_filename = ""
    deck_manifest = None
    script_payload = None
    slides_results = None
    try:
        resolved_provider = runtime.provider_id
        adapter = PresentonAdapterService(runtime=runtime)
        await PresentonTaskService.set_status(task_id, "running", progress=5)

        await PresentonTaskService.add_event(task_id, "step_start", "provider_health",
                                             f"Checking provider health ({resolved_provider}/{runtime.model})", progress=10)
        healthy, message = await adapter.check_provider_health()
        if not healthy:
            raise RuntimeError(f"Provider health check failed: {message}")
        await PresentonTaskService.add_event(task_id, "step_done", "provider_health",
                                             "Provider is healthy", progress=18)

        source_text, chapter_data_clean = _extract_source_text_and_chapters(req.content, req.chapterData)
        if not source_text and not req.outlineSlides:
            raise RuntimeError("content or chapterData is required")
        pages_seed = len(req.outlineSlides) if req.outlineSlides else int(req.total_pages or 8)
        pages = max(1, min(int(pages_seed or 8), 40))
        bullets = max(1, min(int(req.num_of_bullets or 3), 6))
        words = max(8, min(int(req.words_each_bullet or 15), 80))

        if req.outlineSlides:
            await PresentonTaskService.add_event(task_id, "step_start", "outline",
                                                 "Applying edited outline", progress=25)
            outline = _normalize_outline_slides(req.outlineSlides, pages)
            await PresentonTaskService.add_event(
                task_id,
                "step_done",
                "outline",
                f"Using edited outline with {len(outline)} slides",
                progress=45,
                payload={"outline_source": "edited"},
            )
        else:
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

        ppt_schema_slides = [
            {
                **slide,
                "tables": slide.get("tables") or [],
                "layout": slide.get("layout") or {"name": "Title and Content"},
            }
            for slide in slides_results
        ]
        ppt_schema = {
            "presentation_title": title,
            "theme": selected_theme,
            "slides": ppt_schema_slides,
            "metadata": {
                "provider": resolved_provider,
                "model": runtime.model,
                "provider_source": runtime.config_source,
                "theme": selected_theme,
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
        }

        await PresentonTaskService.add_event(task_id, "step_start", "svg_deck",
                                             "Building SVG-first deck artifacts", progress=82)
        deck_manifest = build_svg_deck(
            task_id=task_id,
            title=title,
            slides=slides_results,
            runtime=runtime,
        )
        await PresentonTaskService.add_event(task_id, "step_done", "svg_deck",
                                             "SVG deck artifacts generated", progress=84)

        await PresentonTaskService.add_event(
            task_id,
            "step_start",
            "pptx_export",
            "Finalizing PPTX export",
            progress=86,
        )
        pptx_filename = await asyncio.to_thread(create_ppt_from_schema, ppt_schema)
        _attach_pptx_export(deck_manifest, pptx_filename)
        await PresentonTaskService.add_event(
            task_id,
            "step_done",
            "pptx_export",
            "PPTX export finalized",
            progress=92,
        )

        if req.generate_talking_script:
            await PresentonTaskService.add_event(task_id, "step_start", "script",
                                                 "Generating talking script", progress=94)
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
                                                 "Talking script generated", progress=98)

        await PresentonTaskService.add_event(task_id, "step_done", "complete",
                                             "Packaging response", progress=99)

        runtime_public = runtime.public_dict()
        result = {
            "status": "success",
            "results": slides_results,
            "ppt_schema": ppt_schema,
            "provider": resolved_provider,
            "provider_requested": runtime.requested_provider,
            "provider_resolved": runtime.provider_id,
            "provider_source": runtime.config_source,
            "provider_model": runtime.model,
            "fallback_events": [],
            "theme": selected_theme,
            "deck_id": deck_manifest["deck_id"],
            "outline_slides": [
                {
                    "index": idx + 1,
                    "title": item.get("title", ""),
                    "objective": item.get("objective", ""),
                    "key_points": item.get("key_points", []),
                    "content": _outline_to_markdown(item, idx + 1),
                }
                for idx, item in enumerate(outline)
            ],
            "design_spec_url": deck_manifest["design_spec_url"],
            "spec_lock": deck_manifest["spec_lock"],
            "quality_report": deck_manifest["quality_report"],
            "slides": deck_manifest["slides"],
            "exports": deck_manifest["exports"],
            "provider_runtime": runtime_public,
        }
        if script_payload:
            result.update(script_payload)
        await PresentonTaskService.complete(task_id, result)
        if user and user.get("id"):
            try:
                task = await PresentonTaskService.get_task(task_id)
                await _persist_generate_v2_history(
                    user_id=user.get("id", ""),
                    task=task,
                    req=req,
                    runtime=runtime,
                    title=title,
                    result=result,
                    slides_results=slides_results,
                    pptx_filename=pptx_filename,
                    design_spec_url=deck_manifest["design_spec_url"] if deck_manifest else "",
                    script_payload=script_payload,
                )
            except Exception:
                logger.warning("history_insert_failed tool=presenton_generate_v2", exc_info=True)

    except Exception as e:  # noqa: BLE001
        logger.exception("[slides.generate_v2][%s] failed", task_id)
        await PresentonTaskService.fail(task_id, str(e), step="generate_v2")
        if user and user.get("id"):
            try:
                task = await PresentonTaskService.get_task(task_id)
                failed_result = {
                    "status": "failed",
                    "error": str(e),
                    "request_id": (task or {}).get("request_id", ""),
                    "task_id": task_id,
                    "provider_requested": runtime.requested_provider,
                    "provider_resolved": runtime.provider_id,
                    "provider_source": runtime.config_source,
                    "provider_model": runtime.model,
                    "deck_id": deck_manifest["deck_id"] if deck_manifest else "",
                }
                await _persist_generate_v2_history(
                    user_id=user.get("id", ""),
                    task=task,
                    req=req,
                    runtime=runtime,
                    title=title,
                    result=failed_result,
                    slides_results=slides_results,
                    pptx_filename=pptx_filename,
                    design_spec_url=deck_manifest["design_spec_url"] if deck_manifest else "",
                    script_payload=script_payload,
                )
            except Exception:
                logger.warning("history_insert_failed tool=presenton_generate_v2", exc_info=True)


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
    worker_id = f"api-slides-generate-v2-{task_id}"
    claimed = await background_job_dispatcher.claim(
        worker_id=worker_id,
        job_types=[SLIDES_GENERATE_V2_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=900,
    )
    if not claimed:
        return

    await _run_generate_v2_task(task_id, req, runtime, user=user)
    task = await PresentonTaskService.get_task(task_id)
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


@slides_router.post("/generate_v2")
async def generate_v2(
    req: SlidesGenerateV2Schema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None) or uuid.uuid4().hex
    runtime = await _resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.generate_v2",
        user=user,
        require_healthy=True,
    )
    task = await PresentonTaskService.create_task(
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
        job_type=SLIDES_GENERATE_V2_JOB_TYPE,
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
    await PresentonTaskService.add_event(
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
    return {"success": True, "task_id": task["task_id"], "status": task["status"],
            "request_id": request_id}


@slides_router.post("/presenton/outline")
async def generate_presenton_outline(
    req: PresentonOutlineRequestSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = (request.headers.get("X-Request-ID") if request else None) or uuid.uuid4().hex
    runtime = await _resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.presenton.outline",
        user=user,
        require_healthy=True,
    )
    source_text, chapter_data_clean = _extract_source_text_and_chapters(req.content, req.chapterData)
    if not source_text:
        raise HTTPException(status_code=400, detail="content or chapterData is required")

    total_pages = max(1, min(int(req.total_pages or 8), 40))
    adapter = PresentonAdapterService(runtime=runtime)
    outline = await adapter.generate_outline(
        source_text=source_text,
        total_pages=total_pages,
        chapter_data=chapter_data_clean,
    )
    title = (req.presentation_title or "").strip() or (req.source_display_name or "").strip() or "Generated Presentation"
    slides = []
    for idx, item in enumerate(outline, start=1):
        normalized = _normalize_outline_slide(item, idx)
        slides.append({
            "id": f"slide-{idx}",
            "index": idx,
            "title": normalized["title"],
            "objective": normalized["objective"],
            "key_points": normalized["key_points"],
            "content": normalized["content"],
        })

    return {
        "success": True,
        "request_id": request_id,
        "title": title,
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "slides": slides,
    }


@slides_router.post("/presenton/assistant/stream")
async def stream_presenton_assistant(
    req: PresentonAssistantMessageSchema,
    user: dict = Depends(get_current_user),
):
    runtime = await _resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.presenton.assistant",
        user=user,
        require_healthy=True,
    )
    prompt = _build_presenton_assistant_prompt(req)
    ai_gateway = get_ai_gateway_service()

    async def event_stream():
        try:
            async for chunk in ai_gateway.chat_stream_with_runtime(
                message=prompt,
                context={"surface": "presenton_assistant", "response_format": "text"},
                runtime=runtime,
            ):
                payload = json.dumps({"choices": [{"delta": {"content": chunk}}]}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as exc:  # noqa: BLE001
            error_payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {error_payload}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


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
    runtime = await _resolve_presenton_runtime(
        provider or "auto",
        feature="slides.provider_health",
        user=user,
        require_healthy=False,
    )
    adapter = PresentonAdapterService(runtime=runtime)
    healthy, message = await adapter.check_provider_health()
    return {
        "success": healthy,
        "provider": runtime.provider_id,
        "requested_provider": runtime.requested_provider,
        "source": runtime.config_source,
        "model": runtime.model,
        "message": message,
    }


@slides_router.get("/providers")
async def slides_providers(user: dict = Depends(get_current_user)):
    return {"providers": [status.public_dict() for status in await list_provider_statuses(user)]}


def _deck_dir(deck_id: str) -> str:
    safe = "".join(ch for ch in deck_id if ch.isalnum() or ch in {"-", "_"})
    path = os.path.abspath(os.path.join(Config.PPT_RESULTS_FOLDER, "svg_decks", safe))
    root = os.path.abspath(os.path.join(Config.PPT_RESULTS_FOLDER, "svg_decks"))
    if os.path.commonpath([root, path]) != root:
        raise HTTPException(status_code=400, detail="Invalid deck id")
    return path


@slides_router.get("/decks/{deck_id}")
async def get_svg_deck(deck_id: str, user: dict = Depends(get_current_user)):
    manifest_path = os.path.join(_deck_dir(deck_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=404, detail="Deck not found")
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


@slides_router.get("/decks/{deck_id}/design-spec")
async def get_svg_deck_design_spec(deck_id: str, user: dict = Depends(get_current_user)):
    path = os.path.join(_deck_dir(deck_id), "design_spec.md")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Design spec not found")
    with open(path, "r", encoding="utf-8") as f:
        return PlainTextResponse(f.read(), media_type="text/markdown")


@slides_router.get("/decks/{deck_id}/slides/{slide_index}.svg")
async def get_svg_deck_slide(deck_id: str, slide_index: int, user: dict = Depends(get_current_user)):
    manifest_path = os.path.join(_deck_dir(deck_id), "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=404, detail="Deck not found")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    slide = next((item for item in manifest.get("slides", []) if int(item.get("index", 0)) == slide_index), None)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    path = os.path.join(_deck_dir(deck_id), "svg_output", slide["filename"])
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Slide SVG not found")
    return FileResponse(path, media_type="image/svg+xml")


@slides_router.get("/delivery/jobs/{job_id}")
async def get_slides_delivery_job(job_id: str, user: dict = Depends(get_current_user)):
    return await get_delivery_job(job_id=job_id, user=user)


@slides_router.get("/delivery/jobs/{job_id}/artifact/{artifact_type}")
async def get_slides_delivery_artifact(
    job_id: str, artifact_type: str, user: dict = Depends(get_current_user)
):
    return await get_delivery_artifact(job_id=job_id, artifact_type=artifact_type, user=user)
