from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from backend.core.security import get_current_user
from backend.services.video_service import (
    extract_text_from_md_txt,
    extract_text_from_pdf,
    generate_slide_contents,
    smart_extract,
)
from backend.services.video_service.script_job_service import VideoScriptJobService

from fastapi import APIRouter
router = APIRouter()
from .shared import ALLOWED_EXT, UPLOAD_TMP

logger = logging.getLogger(__name__)


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

    source_text = text or ""
    if file_path:
        try:
            if file_type == "pdf":
                source_text = "\n\n".join(extract_text_from_pdf(file_path))
            else:
                source_text = "\n\n".join(extract_text_from_md_txt(file_path))
        except Exception:
            source_text = ""

    slide_contents = await generate_slide_contents(result, source_text, lang, provider, audience)
    return {"scripts": result, "slideContents": slide_contents}


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

    job = await VideoScriptJobService.create_job(
        user_id=str(current_user.get("id") or ""),
        meta={
            "lang": lang,
            "provider": provider,
            "audience": audience,
            "max_segments": max_segments,
        },
    )
    job_id = str(job["job_id"])
    user_id = str(current_user.get("id") or "")

    async def _run():
        try:
            await VideoScriptJobService.update_job(
                job_id,
                user_id=user_id,
                progress=10,
                message="Extracting & splitting content...",
            )
            scripts = await smart_extract(
                text=text,
                file_path=file_path,
                file_type=file_type,
                max_segments=max_segments,
                lang=lang,
                provider=provider,
                audience=audience,
            )
            await VideoScriptJobService.update_job(
                job_id,
                user_id=user_id,
                progress=60,
                message="Generating slide contents...",
            )

            source_text = text or ""
            if file_path:
                try:
                    if file_type == "pdf":
                        source_text = "\n\n".join(extract_text_from_pdf(file_path))
                    else:
                        source_text = "\n\n".join(extract_text_from_md_txt(file_path))
                except Exception:
                    source_text = ""

            slide_contents = await generate_slide_contents(scripts, source_text, lang, provider, audience)
            await VideoScriptJobService.update_job(
                job_id,
                user_id=user_id,
                status="done",
                progress=100,
                message="Done",
                scripts=scripts,
                slideContents=slide_contents,
            )
        except Exception as exc:
            logger.exception("Script generation job %s failed", job_id)
            await VideoScriptJobService.update_job(
                job_id,
                user_id=user_id,
                status="error",
                progress=0,
                message=str(exc),
            )

    background_tasks.add_task(_run)
    return {"jobId": job_id}
