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
from backend.services.video_service import (
    BACKEND_ROOT,
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
router = APIRouter(prefix="/api/video", tags=["video"])

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
    max_segments: int = Form(8),
    audience: str = Form("student"),
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

    # Handle per-scene image uploads
    if scenes_list:
        for sc in scenes_list:
            img_path = sc.get("customImagePath")
            if img_path:
                full = UPLOAD_TMP / Path(img_path).name
                if not full.exists():
                    sc["customImagePath"] = None

    # Schedule background coroutine
    user_id = current_user.get("id", "")

    async def _run():
        await run_video_pipeline(
            task_id,
            lang=lang,
            provider=provider,
            source_text=text,
            uploaded_file_path=file_path,
            file_type=file_type,
            scripts_override=scripts_list,
            scenes=scenes_list,
            subtitles=subtitles,
            max_segments=max_segments,
            audience=audience,
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
async def script_progress_sse(job_id: str, current_user: dict = Depends(get_current_user)):
    """SSE endpoint: streams progress events until the script job completes."""
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
