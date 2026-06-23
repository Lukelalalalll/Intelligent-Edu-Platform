from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas.slide_schema import RenderOptions, SceneAssets, SceneModel, parse_scene_body
from backend.services.history_service import save_history_record
from backend.services.video_service import get_task, new_task, run_video_pipeline

from fastapi import APIRouter
router = APIRouter()
from .shared import ALLOWED_EXT, ALLOWED_IMG_EXT, UPLOAD_TMP

logger = logging.getLogger(__name__)


def _parse_json_list(raw_value: str | None) -> list | None:
    if not raw_value:
        return None
    try:
        parsed = json.loads(raw_value)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, list) else None


def _normalize_scene_payloads(
    scenes_list: list[dict] | None,
    *,
    animation_level: str,
    subtitle_mode: str,
    subtitles: bool,
) -> list[dict] | None:
    if not scenes_list:
        return None

    validated_scenes: list[dict] = []
    for raw_sc in scenes_list:
        custom_img = None
        if raw_sc.get("customImagePath"):
            candidate = UPLOAD_TMP / Path(raw_sc["customImagePath"]).name
            custom_img = str(candidate) if candidate.exists() else None

        layout_img = None
        if raw_sc.get("layoutImagePath"):
            candidate = UPLOAD_TMP / Path(raw_sc["layoutImagePath"]).name
            layout_img = str(candidate) if candidate.exists() else None

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
            scene_dict = scene_model.model_dump()
            scene_dict["customImagePath"] = scene_model.assets.customImagePath
            scene_dict["layoutImagePath"] = scene_model.assets.layoutImagePath
            scene_dict.update(scene_model.parsedContent.model_dump())
            validated_scenes.append(scene_dict)
        except Exception as exc:
            logger.warning("Scene validation failed id=%s: %s - using raw", raw_sc.get("id"), exc)
            validated_scenes.append(raw_sc)
    return validated_scenes


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
        Path(file_path).write_bytes(await file.read())
        file_type = suffix.lstrip(".")

    scripts_list = _parse_json_list(scripts)
    scenes_list = _parse_json_list(scenes)

    validated_scenes = _normalize_scene_payloads(
        scenes_list,
        animation_level=animation_level,
        subtitle_mode=subtitle_mode,
        subtitles=subtitles,
    )

    avatar_image_full_path = None
    if avatar_img_path:
        candidate = UPLOAD_TMP / Path(avatar_img_path).name
        if candidate.exists() and candidate.suffix.lower() in ALLOWED_IMG_EXT:
            avatar_image_full_path = str(candidate)

    user_id = current_user.get("id", "")

    valid_subtitle_modes = {"hard_srt", "image_strip", "none"}
    if subtitle_mode not in valid_subtitle_modes:
        subtitle_mode = "hard_srt"

    if brand_kit not in {"none", "default"}:
        brand_kit = "none"
    if animation_level not in {"off", "basic", "high"}:
        animation_level = "basic"
    if tts_engine not in {"edge_tts", "cosyvoice"}:
        tts_engine = "edge_tts"
    if avatar_mode not in {"none", "wav2lip", "latentsync"}:
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
        task = get_task(task_id)
        if task and task.get("status") == "done":
            try:
                await save_history_record(
                    tool="video",
                    user_id=user_id,
                    tool_name="video_generate",
                    params={
                        "lang": lang,
                        "provider": provider,
                        "subtitles": subtitles,
                        "max_segments": max_segments,
                        "audience": audience,
                        "has_scenes": bool(scenes_list),
                        "scene_count": len(scenes_list) if scenes_list else 0,
                    },
                    result_preview=task.get("message", "Video ready!"),
                    result_full={"task_id": task_id, "videoPath": task.get("videoPath", "")},
                    expires_at=await compute_history_expires_at(user_id),
                )
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
