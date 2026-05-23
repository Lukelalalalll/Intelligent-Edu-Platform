import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from backend.core.database import db, compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas.slide_schema import SceneModel, SceneAssets, RenderOptions, parse_scene_body
from backend.services.video_service import (
    BACKEND_ROOT,
    _tasks,
    extract_text_from_md_txt,
    extract_text_from_pdf,
    generate_scripts,
    generate_slide_contents,
    get_task,
    new_task,
    optimize_full_script,
    run_video_pipeline,
    smart_extract,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/video", tags=["video"])

UPLOAD_TMP = BACKEND_ROOT / "uploads" / "video_tmp"
UPLOAD_TMP.mkdir(parents=True, exist_ok=True)
ALLOWED_EXT = {".pdf", ".md", ".txt"}
ALLOWED_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp"}


@router.post("/upload-scene-image")
async def upload_scene_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an image for a specific scene. Returns the server-side filename."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_IMG_EXT:
        raise HTTPException(400, f"Unsupported image type: {suffix}")
    name = f"scene_{uuid.uuid4().hex}{suffix}"
    dest = UPLOAD_TMP / name
    dest.write_bytes(await file.read())
    return {"filename": name, "path": str(dest)}


@router.post("/generate")
async def generate_video(
    background_tasks: BackgroundTasks,
    text: str = Form(None),
    file: UploadFile = File(None),
    scripts: str = Form(None),
    scenes: str = Form(None),
    lang: str = Form("zh"),
    provider: str = Form("local_ollama"),
    subtitles: bool = Form(True),
    subtitle_mode: str = Form("hard_srt"),
    max_segments: int = Form(8),
    audience: str = Form("student"),
    brand_kit: str = Form("none"),
    animation_level: str = Form("basic"),
    tts_engine: str = Form("edge_tts"),
    avatar_mode: str = Form("none"),
    avatar_img_path: str = Form(""),
    quiz_enabled: bool = Form(False),
    current_user: dict = Depends(get_current_user),
):
    """
    Start an async video generation task.
    V2 accepts `scenes` (JSON array of Scene objects) for themed slides.
    Legacy: `text` / `file` / `scripts` still supported.
    """
    if not text and not file and not scenes:
        raise HTTPException(400, "Provide text, a file, or scenes")
    if lang not in ("zh", "en"):
        lang = "zh"

    task_id = uuid.uuid4().hex
    new_task(task_id)

    file_path, file_type = None, None
    if file:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(400, f"Unsupported file type: {suffix}")
        file_path = str(UPLOAD_TMP / f"{task_id}{suffix}")
        content = await file.read()
        Path(file_path).write_bytes(content)
        file_type = suffix.lstrip(".")

    scripts_list = None
    if scripts:
        try:
            scripts_list = json.loads(scripts)
            if not isinstance(scripts_list, list):
                scripts_list = None
        except (json.JSONDecodeError, TypeError):
            scripts_list = None

    scenes_list = None
    if scenes:
        try:
            scenes_list = json.loads(scenes)
            if not isinstance(scenes_list, list):
                scenes_list = None
        except (json.JSONDecodeError, TypeError):
            scenes_list = None

    # ── Validate and enrich scene data via Pydantic ──
    validated_scenes: list[dict] | None = None
    if scenes_list:
        validated_scenes = []
        for raw_sc in scenes_list:
            custom_img = None
            if raw_sc.get("customImagePath"):
                p = UPLOAD_TMP / Path(raw_sc["customImagePath"]).name
                custom_img = str(p) if p.exists() else None

            layout_img = None
            if raw_sc.get("layoutImagePath"):
                p = UPLOAD_TMP / Path(raw_sc["layoutImagePath"]).name
                layout_img = str(p) if p.exists() else None

            parsed_content = parse_scene_body(raw_sc)

            try:
                scene_model = SceneModel(
                    id=raw_sc.get("id", ""),
                    layoutType=raw_sc.get("layoutType", "title-bullets"),
                    themeId=raw_sc.get("themeId", "dark-ocean"),
                    slideMode=raw_sc.get("slideMode", "theme"),
                    slideTitle=raw_sc.get("slideTitle", "")[:100],
                    slideBody=raw_sc.get("slideBody", ""),
                    parsedContent=parsed_content,
                    assets=SceneAssets(customImagePath=custom_img, layoutImagePath=layout_img),
                    renderOptions=RenderOptions(
                        animationLevel=animation_level,
                        subtitleMode=subtitle_mode if subtitles else "none",
                        toneMode=raw_sc.get("toneMode", "lecture"),
                    ),
                    script=raw_sc.get("script", ""),
                    toneMode=raw_sc.get("toneMode", "lecture"),
                )
                sc_dict = scene_model.model_dump()
                # Flatten for pipeline/render.py compat (they still use plain dicts)
                sc_dict["customImagePath"] = scene_model.assets.customImagePath
                sc_dict["layoutImagePath"] = scene_model.assets.layoutImagePath
                sc_dict.update(scene_model.parsedContent.model_dump())
                validated_scenes.append(sc_dict)
            except Exception as e:
                logger.warning("Scene validation failed id=%s: %s — using raw", raw_sc.get("id"), e)
                validated_scenes.append(raw_sc)

    # Validate avatar image path (must come from /uploads/video_tmp)
    avatar_image_full_path = None
    if avatar_img_path:
        candidate = UPLOAD_TMP / Path(avatar_img_path).name
        if candidate.exists() and candidate.suffix.lower() in ALLOWED_IMG_EXT:
            avatar_image_full_path = str(candidate)

    # Schedule background coroutine
    user_id = current_user.get("id", "")

    # Validate subtitle_mode; reject unknown values
    _VALID_SUBTITLE_MODES = {"hard_srt", "image_strip", "none"}
    if subtitle_mode not in _VALID_SUBTITLE_MODES:
        subtitle_mode = "hard_srt"

    # Validate brand_kit and animation_level
    _VALID_BRAND_KITS = {"none", "default"}
    if brand_kit not in _VALID_BRAND_KITS:
        brand_kit = "none"
    _VALID_ANIMATION_LEVELS = {"off", "basic", "high"}
    if animation_level not in _VALID_ANIMATION_LEVELS:
        animation_level = "basic"
    _VALID_TTS_ENGINES = {"edge_tts", "cosyvoice"}
    if tts_engine not in _VALID_TTS_ENGINES:
        tts_engine = "edge_tts"
    _VALID_AVATAR_MODES = {"none", "wav2lip", "latentsync"}
    if avatar_mode not in _VALID_AVATAR_MODES:
        avatar_mode = "none"

    async def _run():
        await run_video_pipeline(
            task_id,
            lang=lang,
            provider=provider,
            source_text=text,
            uploaded_file_path=file_path,
            file_type=file_type,
            scripts_override=scripts_list,
            scenes=validated_scenes,
            subtitles=subtitles,
            subtitle_mode=subtitle_mode,
            max_segments=max_segments,
            audience=audience,
            brand_kit=brand_kit,
            animation_level=animation_level,
            tts_engine=tts_engine,
            avatar_mode=avatar_mode,
            avatar_img_path=avatar_image_full_path,
            quiz_enabled=quiz_enabled,
        )
        # ── save history when pipeline finishes successfully ──
        task = get_task(task_id)
        if task and task.get("status") == "done":
            try:
                _exp = await compute_history_expires_at(user_id)
                _doc = {
                    "user_id": user_id,
                    "tool": "video_generate",
                    "params": {
                        "lang": lang,
                        "provider": provider,
                        "subtitles": subtitles,
                        "max_segments": max_segments,
                        "audience": audience,
                        "has_scenes": bool(scenes_list),
                        "scene_count": len(scenes_list) if scenes_list else 0,
                    },
                    "result_preview": task.get("message", "Video ready!"),
                    "result_full": json.dumps({
                        "task_id": task_id,
                        "videoPath": task.get("videoPath", ""),
                    }),
                    "created_at": datetime.now(timezone.utc),
                }
                if _exp is not None:
                    _doc["expires_at"] = _exp
                await db.video_generation_history.insert_one(_doc)
            except Exception:
                logger.warning("Failed to save video generation history", exc_info=True)

    background_tasks.add_task(_run)
    return {"taskId": task_id}


@router.get("/status/{task_id}")
async def video_status(task_id: str, current_user: dict = Depends(get_current_user)):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/optimize-script")
async def optimize_script_endpoint(
    text: str = Form(None),
    file: UploadFile = File(None),
    lang: str = Form("zh"),
    provider: str = Form("local_ollama"),
    max_segments: int = Form(8),
    audience: str = Form("student"),
    current_user: dict = Depends(get_current_user),
):
    """
    Pre-generate narration scripts so users can review/edit before video generation.
    Uses smart_extract for unified max_segments enforcement.
    """
    if lang not in ("zh", "en"):
        lang = "zh"

    file_path, file_type = None, None
    if file:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(400, f"Unsupported file type: {suffix}")
        tmp = UPLOAD_TMP / f"opt_{uuid.uuid4().hex}{suffix}"
        tmp.write_bytes(await file.read())
        file_path = str(tmp)
        file_type = suffix.lstrip(".")

    if not file_path and not text:
        raise HTTPException(400, "Provide either text or a file")

    result = await smart_extract(
        text=text,
        file_path=file_path,
        file_type=file_type,
        max_segments=max_segments,
        lang=lang,
        provider=provider,
        audience=audience,
    )

    # Generate structured slide contents (title + bullets) for each script
    source_text = text or ""
    if file_path:
        try:
            if file_type == "pdf":
                source_text = "\n\n".join(extract_text_from_pdf(file_path))
            else:
                source_text = "\n\n".join(extract_text_from_md_txt(file_path))
        except Exception:
            source_text = ""

    slide_contents = await generate_slide_contents(
        result, source_text, lang, provider, audience
    )

    return {"scripts": result, "slideContents": slide_contents}


# ── In-memory SSE job store for script generation progress ──
_script_jobs: dict[str, dict] = {}


@router.post("/optimize-script-async")
async def optimize_script_async(
    background_tasks: BackgroundTasks,
    text: str = Form(None),
    file: UploadFile = File(None),
    lang: str = Form("zh"),
    provider: str = Form("local_ollama"),
    max_segments: int = Form(8),
    audience: str = Form("student"),
    current_user: dict = Depends(get_current_user),
):
    """Start async script generation. Returns a jobId for SSE progress tracking."""
    if lang not in ("zh", "en"):
        lang = "zh"

    file_path, file_type = None, None
    if file:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(400, f"Unsupported file type: {suffix}")
        tmp = UPLOAD_TMP / f"opt_{uuid.uuid4().hex}{suffix}"
        tmp.write_bytes(await file.read())
        file_path = str(tmp)
        file_type = suffix.lstrip(".")

    if not file_path and not text:
        raise HTTPException(400, "Provide either text or a file")

    job_id = uuid.uuid4().hex
    _script_jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "message": "Starting...",
        "scripts": None,
        "slideContents": None,
    }

    async def _run():
        job = _script_jobs[job_id]
        try:
            job.update({"progress": 10, "message": "Extracting & splitting content..."})
            scripts = await smart_extract(
                text=text, file_path=file_path, file_type=file_type,
                max_segments=max_segments, lang=lang, provider=provider, audience=audience,
            )
            job.update({"progress": 60, "message": "Generating slide contents..."})

            source_text = text or ""
            if file_path:
                try:
                    if file_type == "pdf":
                        source_text = "\n\n".join(extract_text_from_pdf(file_path))
                    else:
                        source_text = "\n\n".join(extract_text_from_md_txt(file_path))
                except Exception:
                    source_text = ""

            slide_contents = await generate_slide_contents(
                scripts, source_text, lang, provider, audience
            )
            job.update({
                "status": "done", "progress": 100, "message": "Done",
                "scripts": scripts, "slideContents": slide_contents,
            })
        except Exception as exc:
            logger.exception("Script generation job %s failed", job_id)
            job.update({"status": "error", "progress": 0, "message": str(exc)})

    background_tasks.add_task(_run)
    return {"jobId": job_id}


@router.get("/script-progress/{job_id}")
async def script_progress_sse(job_id: str):
    """SSE endpoint: streams progress events until the script job completes.

    Auth is intentionally omitted: the job_id is a UUID (128-bit random) which is
    practically unguessable, and EventSource cannot send HttpOnly cookies cross-origin.
    """
    if job_id not in _script_jobs:
        raise HTTPException(404, "Job not found")

    async def event_stream():
        while True:
            job = _script_jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Job not found'})}\n\n"
                break
            yield f"data: {json.dumps({'status': job['status'], 'progress': job['progress'], 'message': job['message']})}\n\n"
            if job["status"] in ("done", "error"):
                # Send final payload with data
                yield f"data: {json.dumps(job)}\n\n"
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")



# ───────────────────────── Video Progress SSE ──────────────────────────

@router.get("/progress/{task_id}")
async def video_progress_sse(task_id: str):
    """SSE endpoint: streams real-time progress events for a video generation task.

    Event types emitted in the `type` field:
      "progress" — periodic update while running
      "warn"     — task completed but some clips failed (partial output)
      "done"     — task finished successfully
      "error"    — task failed

    Auth is intentionally omitted: task_id is a UUID4 hex (128-bit entropy),
    practically unguessable. EventSource cannot send HttpOnly cookies cross-origin.
    The existing /status/{task_id} endpoint remains as a polling fallback.
    """
    if task_id not in _tasks:
        raise HTTPException(404, "Task not found")

    async def _stream():
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
            elif status == "error":
                payload["type"] = "error"
                payload["error"] = task.get("error", "Unknown error")
                if clip_errors:
                    payload["errors"] = clip_errors
                yield f"data: {json.dumps(payload)}\n\n"
                break

            # Only push when something actually changed (saves bandwidth)
            if progress != last_progress:
                yield f"data: {json.dumps(payload)}\n\n"
                last_progress = progress

            await asyncio.sleep(0.4)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # tell nginx not to buffer SSE
            "Connection": "keep-alive",
        },
    )


# ───────────────────────── Generation History ──────────────────────────

@router.get("/generation_history")
async def list_video_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user.get("id", "")
    skip = (page - 1) * page_size
    cursor = (
        db.video_generation_history
        .find({"user_id": user_id}, {"result_full": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "tool": doc.get("tool", ""),
            "params": doc.get("params", {}),
            "preview": doc.get("result_preview", ""),
            "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        })
    total = await db.video_generation_history.count_documents({"user_id": user_id})
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/generation_history/{history_id}")
async def get_video_history_detail(
    history_id: str,
    current_user: dict = Depends(get_current_user),
):
    from bson import ObjectId

    try:
        oid = ObjectId(history_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid history ID format")
    doc = await db.video_generation_history.find_one(
        {"_id": oid, "user_id": current_user.get("id", "")}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="History record not found")
    return {
        "success": True,
        "id": str(doc.get("_id")),
        "params": doc.get("params", {}),
        "result": doc.get("result_full", ""),
        "created_at": doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
    }
