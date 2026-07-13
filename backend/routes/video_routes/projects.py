from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile

from backend.core.security import get_current_user
from backend.services.video_service.project_service import VideoProjectService

from .shared import ALLOWED_EXT, ALLOWED_IMG_EXT, UPLOAD_TMP

router = APIRouter()

_PROVIDER_CONFIG_KEYS = {
    "lang",
    "provider",
    "audience",
    "subtitles",
    "subtitle_mode",
    "subtitleMode",
    "brand_kit",
    "brandKit",
    "animation_level",
    "animationLevel",
    "tts_engine",
    "ttsEngine",
    "avatar_mode",
    "avatarMode",
    "avatar_img_path",
    "avatarImagePath",
    "quiz_enabled",
    "quizEnabled",
    "max_segments",
    "maxSegments",
    "broll_provider",
    "brollProvider",
    "comfyui_base_url",
    "comfyui_workflow_path",
    "default_negative_prompt",
}


def _coerce_provider_config(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "lang": payload.get("lang", "zh"),
        "provider": payload.get("provider", "local_ollama"),
        "audience": payload.get("audience", "student"),
        "subtitles": payload.get("subtitles", True),
        "subtitle_mode": payload.get("subtitle_mode", payload.get("subtitleMode", "hard_srt")),
        "brand_kit": payload.get("brand_kit", payload.get("brandKit", "none")),
        "animation_level": payload.get("animation_level", payload.get("animationLevel", "basic")),
        "tts_engine": payload.get("tts_engine", payload.get("ttsEngine", "edge_tts")),
        "avatar_mode": payload.get("avatar_mode", payload.get("avatarMode", "none")),
        "avatar_img_path": payload.get("avatar_img_path", payload.get("avatarImagePath", "")),
        "quiz_enabled": payload.get("quiz_enabled", payload.get("quizEnabled", False)),
        "max_segments": payload.get("max_segments", payload.get("maxSegments", 8)),
        "broll_provider": payload.get("broll_provider", payload.get("brollProvider", "comfyui")),
    }


def _extract_provider_config(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    explicit = {key: value for key, value in payload.items() if key in _PROVIDER_CONFIG_KEYS}
    if not explicit:
        nested = payload.get("provider_config") or payload.get("providerConfig")
        if isinstance(nested, dict):
            explicit = {key: value for key, value in nested.items() if key in _PROVIDER_CONFIG_KEYS}
    return _coerce_provider_config(explicit) if explicit else None


@router.post("/projects")
async def create_video_project(
    title: str = Form(""),
    text: str = Form(""),
    file: UploadFile | None = File(None),
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
    broll_provider: str = Form("comfyui"),
    current_user: dict = Depends(get_current_user),
):
    uploaded_file_path = ""
    file_type = ""
    source_filename = ""
    if file:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(400, f"Unsupported file type: {suffix}")
        source_filename = str(file.filename or "")
        temp_name = f"video_project_{uuid.uuid4().hex}{suffix}"
        temp_path = UPLOAD_TMP / temp_name
        temp_path.write_bytes(await file.read())
        uploaded_file_path = str(temp_path)
        file_type = suffix.lstrip(".")

    project = await VideoProjectService.create_project(
        user_id=str(current_user.get("id") or ""),
        title=title,
        source_text=text,
        source_filename=source_filename,
        uploaded_file_path=uploaded_file_path,
        file_type=file_type,
        provider_config=_coerce_provider_config(
            {
                "lang": lang,
                "provider": provider,
                "subtitles": subtitles,
                "subtitle_mode": subtitle_mode,
                "max_segments": max_segments,
                "audience": audience,
                "brand_kit": brand_kit,
                "animation_level": animation_level,
                "tts_engine": tts_engine,
                "avatar_mode": avatar_mode,
                "avatar_img_path": avatar_img_path,
                "quiz_enabled": quiz_enabled,
                "broll_provider": broll_provider,
            }
        ),
    )
    return {"success": True, "project": project}


@router.get("/projects")
async def list_video_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    result = await VideoProjectService.list_projects(
        user_id=str(current_user.get("id") or ""),
        page=page,
        page_size=page_size,
    )
    return {"success": True, **result}


@router.get("/projects/{project_id}")
async def get_video_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = await VideoProjectService.get_project(project_id, user_id=str(current_user.get("id") or ""))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": project}


@router.patch("/projects/{project_id}")
async def patch_video_project(
    project_id: str,
    payload: dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
):
    updated = await VideoProjectService.update_project(
        project_id,
        user_id=str(current_user.get("id") or ""),
        title=payload.get("title"),
        scenes=payload.get("scenes"),
        provider_config=_extract_provider_config(payload),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": updated}


@router.post("/projects/{project_id}/source")
async def update_video_project_source(
    project_id: str,
    title: str = Form(""),
    source_mode: str = Form("text"),
    text: str = Form(""),
    file: UploadFile | None = File(None),
    current_user: dict = Depends(get_current_user),
):
    source_filename = ""
    uploaded_file_path = ""
    file_type = ""
    if file:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXT:
            raise HTTPException(400, f"Unsupported file type: {suffix}")
        source_filename = str(file.filename or "")
        temp_name = f"video_project_{uuid.uuid4().hex}{suffix}"
        temp_path = UPLOAD_TMP / temp_name
        temp_path.write_bytes(await file.read())
        uploaded_file_path = str(temp_path)
        file_type = suffix.lstrip(".")

    try:
        updated = await VideoProjectService.update_project_source(
            project_id,
            user_id=str(current_user.get("id") or ""),
            title=title,
            source_mode=source_mode,
            text=text,
            source_filename=source_filename,
            uploaded_file_path=uploaded_file_path,
            file_type=file_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": updated}


@router.post("/projects/{project_id}/plan")
async def plan_video_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = await VideoProjectService.plan_project(project_id, user_id=str(current_user.get("id") or ""))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": project}


@router.post("/projects/{project_id}/render")
async def render_video_project(
    project_id: str,
    payload: dict[str, Any] = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("id") or "")
    if payload:
        updated = await VideoProjectService.update_project(
            project_id,
            user_id=user_id,
            title=payload.get("title"),
            scenes=payload.get("scenes"),
            provider_config=_extract_provider_config(payload),
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Project not found")
    project = await VideoProjectService.enqueue_render(project_id, user_id=user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": project, "taskId": project["id"], "projectId": project["id"]}


@router.get("/projects/{project_id}/artifacts")
async def get_video_project_artifacts(project_id: str, current_user: dict = Depends(get_current_user)):
    project = await VideoProjectService.get_project(project_id, user_id=str(current_user.get("id") or ""))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "success": True,
        "projectId": project["id"],
        "artifacts": project.get("artifacts", {}),
        "shots": project.get("shots", []),
        "metrics": project.get("metrics", {}),
    }
