from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import Config
from backend.core.database import compute_history_expires_at
from backend.repositories import user_repo, video_project_repo
from backend.repositories._helpers import build_page_result, normalize_pagination, serialize_doc
from backend.schemas.slide_schema import RenderOptions, SceneAssets, SceneModel, parse_scene_body
from backend.services.background_job_dispatcher import background_job_dispatcher
from backend.services.background_job_runtime import spawn_background_coro
from backend.services.history_service import save_history_record
from backend.services.video_service.brand import build_brand_assets
from backend.services.video_service.avatar import apply_avatar
from backend.services.video_service.comfyui_adapter import ComfyUIWanVideoAdapter
from backend.services.video_service.compose import _concat_video, _make_clip, _mux_generated_video
from backend.services.video_service.extract import extract_text_from_md_txt, extract_text_from_pdf
from backend.services.video_service.quiz_generator import (
    compute_scene_offsets,
    generate_chapters,
    generate_quiz_markers,
    probe_duration,
    save_quiz_data,
)
from backend.services.video_service.render import render_scene_slides_v2
from backend.services.video_service.script import generate_scene_visuals, generate_slide_contents, smart_extract
from backend.services.video_service.types import BACKEND_ROOT, VIDEO_DIR

logger = logging.getLogger(__name__)

VIDEO_RENDER_JOB_TYPE = "video.render_project"
DEFAULT_SHOT_DURATION_SECONDS = 4
VIDEO_PROJECTS_ROOT = VIDEO_DIR
VALID_SHOT_TYPES = {"broll", "diagram", "talking-head", "screen", "title-card"}
RENDER_AUDIO_PROGRESS = 28
RENDER_VISUAL_PROGRESS_START = 30
RENDER_VISUAL_PROGRESS_END = 82
RENDER_ASSEMBLE_PROGRESS = 88
RENDER_PUBLISH_PROGRESS = 92


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None = None) -> str:
    return (value or _utcnow()).isoformat()


def _normalize_lang(value: str) -> str:
    return value if value in {"zh", "en"} else "zh"


def _normalize_provider_config(config: dict[str, Any] | None) -> dict[str, Any]:
    cfg = dict(config or {})
    cfg["lang"] = _normalize_lang(str(cfg.get("lang") or "zh"))
    cfg["provider"] = str(cfg.get("provider") or "local_ollama").strip().lower() or "local_ollama"
    cfg["audience"] = str(cfg.get("audience") or "student").strip().lower() or "student"
    cfg["subtitles"] = bool(cfg.get("subtitles", True))
    subtitle_mode = str(cfg.get("subtitle_mode") or cfg.get("subtitleMode") or "hard_srt").strip()
    cfg["subtitle_mode"] = subtitle_mode if subtitle_mode in {"hard_srt", "image_strip", "none"} else "hard_srt"
    cfg["brand_kit"] = str(cfg.get("brand_kit") or cfg.get("brandKit") or "none").strip()
    if cfg["brand_kit"] not in {"none", "default"}:
        cfg["brand_kit"] = "none"
    cfg["animation_level"] = str(cfg.get("animation_level") or cfg.get("animationLevel") or "basic").strip()
    if cfg["animation_level"] not in {"off", "basic", "high"}:
        cfg["animation_level"] = "basic"
    cfg["tts_engine"] = str(cfg.get("tts_engine") or cfg.get("ttsEngine") or "edge_tts").strip()
    if cfg["tts_engine"] not in {"edge_tts", "cosyvoice"}:
        cfg["tts_engine"] = "edge_tts"
    cfg["avatar_mode"] = str(cfg.get("avatar_mode") or cfg.get("avatarMode") or "none").strip()
    if cfg["avatar_mode"] not in {"none", "wav2lip", "latentsync"}:
        cfg["avatar_mode"] = "none"
    cfg["avatar_img_path"] = str(cfg.get("avatar_img_path") or cfg.get("avatarImagePath") or "").strip()
    cfg["quiz_enabled"] = bool(cfg.get("quiz_enabled") or cfg.get("quizEnabled") or False)
    cfg["max_segments"] = max(3, min(15, int(cfg.get("max_segments") or cfg.get("maxSegments") or 8)))
    cfg["broll_provider"] = str(cfg.get("broll_provider") or cfg.get("brollProvider") or Config.VIDEO_BROLL_PROVIDER or "comfyui").strip().lower()
    if cfg["broll_provider"] not in {"comfyui", "local"}:
        cfg["broll_provider"] = "local"
    cfg["comfyui_base_url"] = str(cfg.get("comfyui_base_url") or Config.COMFYUI_BASE_URL or "http://127.0.0.1:8188").strip()
    cfg["comfyui_workflow_path"] = str(cfg.get("comfyui_workflow_path") or Config.COMFYUI_WORKFLOW_PATH or "").strip()
    cfg["default_negative_prompt"] = str(
        cfg.get("default_negative_prompt")
        or Config.COMFYUI_DEFAULT_NEGATIVE_PROMPT
        or ""
    ).strip()
    return cfg


def _default_title(*, source_text: str = "", source_filename: str = "") -> str:
    if source_filename:
        return Path(source_filename).stem[:80] or "Video Project"
    for line in source_text.splitlines():
        line = line.strip()
        if line:
            return line[:80]
    return "Video Project"


async def _load_project_user(user_id: str) -> dict[str, Any] | None:
    return await user_repo.find_by_id(user_id)


def _project_dir(project_id: str) -> Path:
    path = VIDEO_PROJECTS_ROOT / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _empty_storyboard() -> dict[str, Any]:
    return {
        "scripts": [],
        "scene_count": 0,
        "shot_count": 0,
    }


def _empty_metrics() -> dict[str, Any]:
    return {
        "scene_count": 0,
        "shot_count": 0,
        "status_counts": {},
        "completed_shots": 0,
        "failed_shots": 0,
    }


def _to_public_path(path: str | Path | None) -> str:
    if not path:
        return ""
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = (BACKEND_ROOT / resolved).resolve()
    try:
        relative = resolved.relative_to(BACKEND_ROOT)
    except ValueError:
        return str(resolved).replace("\\", "/")
    return str(relative).replace("\\", "/")


def _clamp_progress(value: int) -> int:
    return max(0, min(100, int(value)))


def _compute_visual_render_progress(*, shot_index: int, shot_count: int, provider_percent: int = 0) -> int:
    total_shots = max(1, int(shot_count or 0))
    shot_position = max(0.0, min(float(total_shots), float(shot_index) + (max(0, min(100, int(provider_percent))) / 100.0)))
    span = max(1, RENDER_VISUAL_PROGRESS_END - RENDER_VISUAL_PROGRESS_START)
    ratio = shot_position / float(total_shots)
    progress = RENDER_VISUAL_PROGRESS_START + int(round(ratio * span))
    return _clamp_progress(max(RENDER_VISUAL_PROGRESS_START, min(RENDER_VISUAL_PROGRESS_END, progress)))


def _scene_bullets_to_body(content: dict[str, Any]) -> str:
    bullets = content.get("bullets") or []
    if isinstance(bullets, list) and bullets:
        return "\n".join(f"- {str(item).strip()}" for item in bullets if str(item).strip())
    return ""


def _normalize_scene_bullets(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:120] for item in value if str(item).strip()][:7]


def _normalize_shot_type(value: Any) -> str:
    shot_type = str(value or "").strip().lower()
    return shot_type if shot_type in VALID_SHOT_TYPES else "broll"


def _normalize_duration_seconds(value: Any) -> int:
    try:
        duration = int(value)
    except (TypeError, ValueError):
        duration = DEFAULT_SHOT_DURATION_SECONDS
    return max(3, min(6, duration))


def _merge_negative_prompts(*values: Any) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(text)
    return ", ".join(parts)


def _scene_from_segment(
    segment: str,
    idx: int,
    content: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content = dict(content or {})
    valid_layouts = {
        "title-bullets",
        "image-left",
        "image-right",
        "image-top",
        "big-quote",
        "two-column",
        "bar-chart",
        "flowchart",
        "code",
    }
    layout_type = str(content.get("layoutType") or "title-bullets")
    if layout_type not in valid_layouts:
        layout_type = "title-bullets"
    return {
        "id": uuid.uuid4().hex,
        "script": segment,
        "slideMode": "theme",
        "themeId": "dark-ocean",
        "slideTitle": str(content.get("title") or f"Section {idx + 1}")[:100],
        "slideBody": _scene_bullets_to_body(content),
        "bullets": _normalize_scene_bullets(content.get("bullets")),
        "layoutType": layout_type,
        "toneMode": "lecture",
        "quoteText": content.get("quoteText") or "",
        "col1Title": content.get("col1Title") or "",
        "col1Bullets": content.get("col1Bullets") or [],
        "col2Title": content.get("col2Title") or "",
        "col2Bullets": content.get("col2Bullets") or [],
        "chartData": content.get("chartData") or [],
        "flowSteps": content.get("flowSteps") or [],
        "codeSnippet": content.get("codeSnippet") or "",
        "codeLanguage": content.get("codeLanguage") or "",
    }


def _coerce_scene(scene: dict[str, Any], *, animation_level: str, subtitle_mode: str, subtitles: bool) -> dict[str, Any]:
    parsed_content = parse_scene_body(scene)
    scene_model = SceneModel(
        id=str(scene.get("id") or uuid.uuid4().hex),
        layoutType=scene.get("layoutType", "title-bullets"),
        themeId=scene.get("themeId", "dark-ocean"),
        slideMode=scene.get("slideMode", "theme"),
        slideTitle=scene.get("slideTitle", "")[:100],
        slideBody=scene.get("slideBody", ""),
        parsedContent=parsed_content,
        assets=SceneAssets(
            customImagePath=scene.get("customImagePath"),
            layoutImagePath=scene.get("layoutImagePath"),
        ),
        renderOptions=RenderOptions(
            animationLevel=animation_level,
            subtitleMode=subtitle_mode if subtitles else "none",
            toneMode=scene.get("toneMode", "lecture"),
        ),
        script=scene.get("script", ""),
        toneMode=scene.get("toneMode", "lecture"),
    )
    output = scene_model.model_dump(by_alias=False)
    output["customImagePath"] = scene_model.assets.customImagePath
    output["layoutImagePath"] = scene_model.assets.layoutImagePath
    output.update(scene_model.parsedContent.model_dump())
    bullets = _normalize_scene_bullets(scene.get("bullets"))
    if bullets:
        output["bullets"] = bullets
    visual_prompt = str(scene.get("visualPrompt") or scene.get("visual_prompt") or "").strip()
    if visual_prompt:
        output["visualPrompt"] = visual_prompt[:600]
    negative_prompt = str(scene.get("negativePrompt") or scene.get("negative_prompt") or "").strip()
    if negative_prompt:
        output["negativePrompt"] = negative_prompt[:300]
    output["shotType"] = _normalize_shot_type(scene.get("shotType") or scene.get("shot_type"))
    output["durationSeconds"] = _normalize_duration_seconds(
        scene.get("durationSeconds") or scene.get("duration_seconds")
    )
    return output


def _build_visual_prompt(scene: dict[str, Any], index: int) -> str:
    bullets = scene.get("bullets") or []
    if not bullets:
        slide_body = str(scene.get("slideBody") or "").strip()
        bullets = [line.lstrip("- ").strip() for line in slide_body.splitlines() if line.strip()]
    bullet_text = ", ".join(str(item).strip() for item in bullets[:4] if str(item).strip())
    title = str(scene.get("slideTitle") or f"Scene {index + 1}").strip()
    script = str(scene.get("script") or "").strip()
    layout_hint = str(scene.get("layoutType") or "title-bullets").replace("-", " ")
    prompt_parts = [
        title,
        script[:220],
        bullet_text[:180],
        f"teaching video b-roll, {layout_hint}, clean composition, stable motion",
    ]
    return ", ".join(part for part in prompt_parts if part)


def _build_shots_from_scenes(scenes: list[dict[str, Any]], *, negative_prompt: str) -> list[dict[str, Any]]:
    shots: list[dict[str, Any]] = []
    for index, scene in enumerate(scenes):
        scene_visual_prompt = str(scene.get("visualPrompt") or scene.get("visual_prompt") or "").strip()
        scene_negative_prompt = str(scene.get("negativePrompt") or scene.get("negative_prompt") or "").strip()
        shots.append(
            {
                "shot_id": uuid.uuid4().hex,
                "scene_id": scene["id"],
                "scene_order": index + 1,
                "shot_order": 1,
                "shot_type": _normalize_shot_type(scene.get("shotType") or scene.get("shot_type")),
                "duration_seconds": _normalize_duration_seconds(
                    scene.get("durationSeconds") or scene.get("duration_seconds")
                ),
                "visual_prompt": scene_visual_prompt or _build_visual_prompt(scene, index),
                "negative_prompt": _merge_negative_prompts(scene_negative_prompt, negative_prompt),
                "narration_text": scene.get("script", ""),
                "status": "pending",
                "provider": "",
                "audio_path": "",
                "output_video_path": "",
                "error": "",
                "provider_request": None,
                "provider_response": None,
            }
        )
    return shots


def _metrics_for_shots(shots: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for shot in shots:
        status = str(shot.get("status") or "pending")
        counts[status] = counts.get(status, 0) + 1
    return {
        "scene_count": len({str(shot.get("scene_id") or "") for shot in shots}),
        "shot_count": len(shots),
        "status_counts": counts,
        "completed_shots": counts.get("muxed", 0),
        "failed_shots": counts.get("failed", 0),
    }


def _serialize_project(doc: dict[str, Any]) -> dict[str, Any]:
    payload = json.loads(json.dumps(doc, default=str))
    return serialize_doc(payload)


def _compat_status_payload(project: dict[str, Any]) -> dict[str, Any]:
    artifacts = project.get("artifacts") or {}
    final_video = artifacts.get("final_video") or {}
    raw_status = str(project.get("status") or "pending")
    compat_status = {
        "completed": "done",
        "failed": "error",
    }.get(raw_status, raw_status)
    return {
        "status": compat_status,
        "progress": project.get("progress", 0),
        "message": project.get("latest_message", ""),
        "videoPath": final_video.get("public_path"),
        "thumbnailPath": (artifacts.get("thumbnail") or {}).get("public_path"),
        "chaptersPath": (artifacts.get("chapters") or {}).get("public_path"),
        "quizPath": (artifacts.get("quiz") or {}).get("public_path"),
        "error": project.get("latest_error", ""),
        "errors": [
            {
                "clip_index": max(0, int(shot.get("scene_order", 1)) - 1),
                "stage": "render",
                "reason": shot.get("error", ""),
            }
            for shot in project.get("shots") or []
            if shot.get("status") == "failed" and shot.get("error")
        ],
    }


class VideoProjectService:
    @staticmethod
    async def create_project(
        *,
        user_id: str,
        title: str = "",
        source_text: str = "",
        source_filename: str = "",
        uploaded_file_path: str = "",
        file_type: str = "",
        provider_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = _utcnow()
        cfg = _normalize_provider_config(provider_config)
        document = {
            "user_id": user_id,
            "title": (title or _default_title(source_text=source_text, source_filename=source_filename))[:100],
            "status": "draft",
            "progress": 0,
            "current_step": "draft",
            "latest_message": "Project created",
            "latest_error": "",
            "source": {
                "kind": "file" if uploaded_file_path else "text",
                "text": source_text,
                "source_filename": source_filename,
                "file_type": file_type,
                "uploaded_file_path": uploaded_file_path,
            },
            "provider_config": cfg,
            "storyboard": _empty_storyboard(),
            "scenes": [],
            "shots": [],
            "artifacts": {},
            "metrics": _empty_metrics(),
            "events": [
                {
                    "type": "step_start",
                    "step": "draft",
                    "message": "Project created",
                    "ts": _iso(now),
                    "progress": 0,
                }
            ],
            "created_at": now,
            "updated_at": now,
        }
        insert_result = await video_project_repo.insert_project(document)
        document["_id"] = insert_result.inserted_id
        return _serialize_project(document)

    @staticmethod
    async def list_projects(*, user_id: str, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
        total, items = await video_project_repo.list_projects_page(
            user_id=user_id,
            limit=safe_page_size,
            skip=(safe_page - 1) * safe_page_size,
        )
        return build_page_result(
            items=[_serialize_project(item) for item in items],
            total=total,
            page=safe_page,
            page_size=safe_page_size,
        )

    @staticmethod
    async def get_project(project_id: str, *, user_id: str) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        return _serialize_project(project) if project else None

    @staticmethod
    async def get_project_doc(project_id: str, *, user_id: str) -> dict[str, Any] | None:
        return await video_project_repo.find_project(project_id, user_id=user_id)

    @staticmethod
    async def add_event(
        project_id: str,
        *,
        user_id: str,
        step: str,
        message: str,
        event_type: str = "step_progress",
        progress: int | None = None,
        status: str | None = None,
        latest_error: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        now = _utcnow()
        event = {
            "type": event_type,
            "step": step,
            "message": message,
            "ts": _iso(now),
        }
        if progress is not None:
            event["progress"] = progress
        if payload:
            event["payload"] = payload
        return await video_project_repo.append_event(
            project_id,
            user_id=user_id,
            event=event,
            status=status,
            current_step=step,
            progress=progress,
            latest_error=latest_error,
            updated_at=now,
        )

    @staticmethod
    async def update_project(
        project_id: str,
        *,
        user_id: str,
        title: str | None = None,
        scenes: list[dict[str, Any]] | None = None,
        provider_config: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return None
        cfg = _normalize_provider_config(project.get("provider_config"))
        if provider_config:
            cfg.update(_normalize_provider_config({**cfg, **provider_config}))

        set_fields: dict[str, Any] = {
            "provider_config": cfg,
            "updated_at": _utcnow(),
        }
        if title is not None:
            set_fields["title"] = str(title or project.get("title") or "Video Project")[:100]

        if scenes is not None:
            validated_scenes = [
                _coerce_scene(
                    scene,
                    animation_level=cfg["animation_level"],
                    subtitle_mode=cfg["subtitle_mode"],
                    subtitles=cfg["subtitles"],
                )
                for scene in scenes
            ]
            shots = _build_shots_from_scenes(validated_scenes, negative_prompt=cfg["default_negative_prompt"])
            set_fields["scenes"] = validated_scenes
            set_fields["shots"] = shots
            set_fields["storyboard"] = {
                "scripts": [scene.get("script", "") for scene in validated_scenes],
                "scene_count": len(validated_scenes),
                "shot_count": len(shots),
                "planned_at": _iso(),
            }
            set_fields["metrics"] = _metrics_for_shots(shots)

        updated = await video_project_repo.update_project(project_id, user_id=user_id, set_fields=set_fields)
        return _serialize_project(updated) if updated else None

    @staticmethod
    async def update_project_source(
        project_id: str,
        *,
        user_id: str,
        title: str | None = None,
        source_mode: str = "text",
        text: str | None = None,
        source_filename: str = "",
        uploaded_file_path: str = "",
        file_type: str = "",
    ) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return None

        existing_source = dict(project.get("source") or {})
        normalized_mode = "file" if str(source_mode or "").strip().lower() == "file" else "text"
        normalized_title = str(title or project.get("title") or "Video Project").strip()[:100]

        if normalized_mode == "file":
            resolved_file_path = str(uploaded_file_path or existing_source.get("uploaded_file_path") or "").strip()
            resolved_filename = str(source_filename or existing_source.get("source_filename") or "").strip()
            resolved_file_type = str(file_type or existing_source.get("file_type") or "").strip()
            if not resolved_file_path:
                raise ValueError("A source file is required when source mode is file.")
            source_payload = {
                "kind": "file",
                "text": str(text or existing_source.get("text") or ""),
                "source_filename": resolved_filename,
                "file_type": resolved_file_type,
                "uploaded_file_path": resolved_file_path,
            }
        else:
            source_payload = {
                "kind": "text",
                "text": str(text or ""),
                "source_filename": "",
                "file_type": "",
                "uploaded_file_path": "",
            }

        await video_project_repo.update_project(
            project_id,
            user_id=user_id,
            set_fields={
                "title": normalized_title or _default_title(
                    source_text=source_payload["text"],
                    source_filename=source_payload["source_filename"],
                ),
                "source": source_payload,
                "status": "draft",
                "progress": 0,
                "current_step": "draft",
                "latest_error": "",
                "storyboard": _empty_storyboard(),
                "scenes": [],
                "shots": [],
                "artifacts": {},
                "metrics": _empty_metrics(),
                "completed_at": None,
                "updated_at": _utcnow(),
            },
            unset_fields={"current_run": ""},
        )
        updated = await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="draft",
            message="Project source updated",
            progress=0,
            status="draft",
            event_type="step_start",
            latest_error="",
            payload={"source_kind": source_payload["kind"]},
        )
        return _serialize_project(updated) if updated else None

    @staticmethod
    async def plan_project(project_id: str, *, user_id: str) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return None

        cfg = _normalize_provider_config(project.get("provider_config"))
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="extract",
            message="Extracting and planning scenes...",
            progress=10,
            status="planning",
        )

        source = project.get("source") or {}
        source_text = str(source.get("text") or "")
        file_path = str(source.get("uploaded_file_path") or "")
        file_type = str(source.get("file_type") or "")
        user = await _load_project_user(user_id)

        scripts = await smart_extract(
            text=source_text or None,
            file_path=file_path or None,
            file_type=file_type or None,
            max_segments=cfg["max_segments"],
            lang=cfg["lang"],
            provider=cfg["provider"],
            audience=cfg["audience"],
            user=user,
        )

        extracted_text = source_text
        if file_path:
            try:
                if file_type == "pdf":
                    extracted_text = "\n\n".join(extract_text_from_pdf(file_path))
                else:
                    extracted_text = "\n\n".join(extract_text_from_md_txt(file_path))
            except Exception:
                logger.warning("Failed to rehydrate extracted text for project %s", project_id, exc_info=True)

        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="scene_build",
            message="Generating scene layout suggestions...",
            progress=18,
            status="planning",
        )
        slide_contents = await generate_slide_contents(
            scripts,
            extracted_text,
            cfg["lang"],
            cfg["provider"],
            cfg["audience"],
            user=user,
        )
        scene_drafts = [
            _scene_from_segment(segment, idx, slide_contents[idx] if idx < len(slide_contents) else None)
            for idx, segment in enumerate(scripts)
        ]
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="shot_expand",
            message=f"Generating AI scene prompts with {cfg['provider']}...",
            progress=22,
            status="planning",
        )
        scene_visuals = await generate_scene_visuals(
            scene_drafts,
            extracted_text,
            lang=cfg["lang"],
            provider=cfg["provider"],
            audience=cfg["audience"],
            user=user,
        )
        scenes = [
            _coerce_scene(
                {
                    **scene_draft,
                    **(scene_visuals[idx] if idx < len(scene_visuals) else {}),
                },
                animation_level=cfg["animation_level"],
                subtitle_mode=cfg["subtitle_mode"],
                subtitles=cfg["subtitles"],
            )
            for idx, scene_draft in enumerate(scene_drafts)
        ]
        shots = _build_shots_from_scenes(scenes, negative_prompt=cfg["default_negative_prompt"])
        metrics = _metrics_for_shots(shots)

        updated = await video_project_repo.update_project(
            project_id,
            user_id=user_id,
            set_fields={
                "status": "planned",
                "progress": 24,
                "current_step": "shot_expand",
                "latest_message": "Project plan ready",
                "latest_error": "",
                "scenes": scenes,
                "shots": shots,
                "storyboard": {
                    "scripts": scripts,
                    "scene_count": len(scenes),
                    "shot_count": len(shots),
                    "planned_at": _iso(),
                },
                "metrics": metrics,
                "updated_at": _utcnow(),
            },
        )
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="shot_expand",
            message=f"Plan ready with {len(scenes)} scenes and {len(shots)} shots",
            progress=24,
            status="planned",
            event_type="step_done",
        )
        return _serialize_project(updated) if updated else None

    @staticmethod
    async def enqueue_render(project_id: str, *, user_id: str) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return None
        if not project.get("scenes"):
            planned = await VideoProjectService.plan_project(project_id, user_id=user_id)
            if not planned:
                return None

        dispatch_job = await background_job_dispatcher.enqueue(
            job_type=VIDEO_RENDER_JOB_TYPE,
            payload={"project_id": project_id, "user_id": user_id},
            metadata={"project_id": project_id, "user_id": user_id},
        )
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="queued",
            message="Render job enqueued",
            progress=2,
            status="queued",
            payload={"dispatch_job_id": dispatch_job["job_id"]},
        )
        await video_project_repo.update_project(
            project_id,
            user_id=user_id,
            set_fields={
                "current_run": {"dispatch_job_id": dispatch_job["job_id"]},
                "updated_at": _utcnow(),
            },
        )
        spawn_background_coro(
            _run_video_render_dispatch_job(dispatch_job["job_id"], project_id, user_id),
            label=f"video-render:{project_id}",
        )
        refreshed = await video_project_repo.find_project(project_id, user_id=user_id)
        return _serialize_project(refreshed) if refreshed else None

    @staticmethod
    async def get_events_since(project_id: str, *, user_id: str, start_index: int) -> tuple[list[dict[str, Any]], int, str]:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return [], start_index, "failed"
        events = project.get("events") or []
        start = max(0, int(start_index or 0))
        return events[start:], len(events), str(project.get("status") or "failed")

    @staticmethod
    async def get_compat_status(project_id: str, *, user_id: str) -> dict[str, Any] | None:
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            return None
        return _compat_status_payload(project)


async def _run_video_render_dispatch_job(dispatch_job_id: str, project_id: str, user_id: str) -> None:
    worker_id = f"api-video-render-{project_id}"
    claimed = await background_job_dispatcher.claim(
        worker_id=worker_id,
        job_types=[VIDEO_RENDER_JOB_TYPE],
        job_id=dispatch_job_id,
        lease_seconds=3600,
    )
    if not claimed:
        return

    try:
        await _render_video_project(project_id, user_id=user_id)
        await background_job_dispatcher.mark_done(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            result={"project_id": project_id, "status": "completed"},
        )
    except Exception as exc:
        logger.exception("Video project render failed: %s", project_id)
        await background_job_dispatcher.mark_failed(
            job_id=dispatch_job_id,
            worker_id=worker_id,
            error=str(exc),
        )
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="failed",
            message=str(exc),
            # progress intentionally omitted so the last known real progress is kept
            status="failed",
            latest_error=str(exc),
            event_type="step_error",
        )


async def _render_video_project(project_id: str, *, user_id: str) -> None:
    project = await video_project_repo.find_project(project_id, user_id=user_id)
    if not project:
        raise ValueError(f"Video project not found: {project_id}")
    if not project.get("scenes"):
        planned = await VideoProjectService.plan_project(project_id, user_id=user_id)
        if not planned:
            raise ValueError("Failed to plan video project")
        project = await video_project_repo.find_project(project_id, user_id=user_id)
        if not project:
            raise ValueError(f"Video project disappeared after planning: {project_id}")

    cfg = _normalize_provider_config(project.get("provider_config"))
    scenes = list(project.get("scenes") or [])
    shots = list(project.get("shots") or [])
    work_dir = _project_dir(project_id)
    preview_dir = work_dir / "preview"
    preview_dir.mkdir(parents=True, exist_ok=True)

    await VideoProjectService.add_event(
        project_id,
        user_id=user_id,
        step="audio",
        message="Synthesizing narration audio...",
        progress=RENDER_AUDIO_PROGRESS,
        status="running",
    )
    from backend.services.video_service.tts import scripts_to_audio

    audio_paths, srt_paths = await scripts_to_audio(
        [scene.get("script", "") for scene in scenes],
        work_dir,
        cfg["lang"],
        cfg["subtitle_mode"] == "hard_srt",
        [scene.get("toneMode", "lecture") for scene in scenes],
        cfg["tts_engine"],
    )

    for index, shot in enumerate(shots):
        shot["status"] = "audio_ready"
        shot["audio_path"] = _to_public_path(audio_paths[index])
        shot["provider"] = cfg["broll_provider"]
    project["shots"] = shots
    project["metrics"] = _metrics_for_shots(shots)
    project = await video_project_repo.find_project(project_id, user_id=user_id) or project
    project["shots"] = shots
    project["metrics"] = _metrics_for_shots(shots)
    project["updated_at"] = _utcnow()
    project["latest_message"] = "Narration audio ready"
    await video_project_repo.replace_project(project_id, user_id=user_id, document=project)

    await VideoProjectService.add_event(
        project_id,
        user_id=user_id,
        step="visual_render",
        message=f"Rendering {len(shots)} shots...",
        progress=_compute_visual_render_progress(shot_index=0, shot_count=len(shots), provider_percent=0),
        status="running",
    )

    adapter = ComfyUIWanVideoAdapter()
    clip_paths: list[Path] = []
    loop = asyncio.get_running_loop()
    progress_futures: list[Any] = []

    async def flush_progress_futures() -> None:
        nonlocal progress_futures
        if not progress_futures:
            return
        pending = progress_futures
        progress_futures = []
        results = await asyncio.gather(*(asyncio.wrap_future(fut) for fut in pending), return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.debug("Dropped ComfyUI progress update: %s", result)

    for index, shot in enumerate(shots):
        scene = scenes[index]
        project = await video_project_repo.find_project(project_id, user_id=user_id) or project
        shot["status"] = "rendering"
        project["shots"] = shots
        project["metrics"] = _metrics_for_shots(shots)
        project["updated_at"] = _utcnow()
        await video_project_repo.replace_project(project_id, user_id=user_id, document=project)

        audio_path = audio_paths[index]
        srt_path = srt_paths[index] if index < len(srt_paths) else None
        clip_out = work_dir / f"clip_{index:03d}.mp4"
        render_with_strip = cfg["subtitle_mode"] == "image_strip"
        animation_level = cfg["animation_level"]
        used_fallback = False
        shot_progress_state = {"last_progress": -1, "last_emit_at": 0.0}

        def emit_shot_progress(progress_info: dict[str, Any]) -> None:
            provider_percent = max(0, min(100, int(progress_info.get("progress_percent") or 0)))
            now = time.monotonic()
            should_emit = (
                provider_percent >= 100
                or provider_percent - shot_progress_state["last_progress"] >= 2
                or now - shot_progress_state["last_emit_at"] >= 1.0
            )
            if not should_emit:
                return
            shot_progress_state["last_progress"] = max(shot_progress_state["last_progress"], provider_percent)
            shot_progress_state["last_emit_at"] = now
            project_progress = _compute_visual_render_progress(
                shot_index=index,
                shot_count=len(shots),
                provider_percent=provider_percent,
            )
            message = f"Rendering shot {index + 1}/{len(shots)}"
            if provider_percent > 0:
                message = f"{message} ({provider_percent}%)"
            future = asyncio.run_coroutine_threadsafe(
                VideoProjectService.add_event(
                    project_id,
                    user_id=user_id,
                    step="visual_render",
                    message=message,
                    progress=project_progress,
                    status="running",
                    payload={
                        "comfyui_progress": provider_percent,
                        "comfyui_node": str(progress_info.get("node") or ""),
                        "comfyui_source": str(progress_info.get("source") or ""),
                        "shot_index": index + 1,
                        "shot_count": len(shots),
                    },
                ),
                loop,
            )
            progress_futures.append(future)

        try:
            if cfg["broll_provider"] == "comfyui":
                raw_out = work_dir / f"shot_{index:03d}_raw.mp4"
                response = await loop.run_in_executor(
                    None,
                    functools.partial(
                        adapter.render_broll_to_file,
                        prompt=shot["visual_prompt"],
                        duration_seconds=int(shot.get("duration_seconds") or DEFAULT_SHOT_DURATION_SECONDS),
                        output_path=raw_out,
                        negative_prompt=shot.get("negative_prompt") or cfg["default_negative_prompt"],
                        progress_callback=emit_shot_progress,
                    ),
                )
                await flush_progress_futures()
                project = await video_project_repo.find_project(project_id, user_id=user_id) or project
                shot["provider_request"] = response.get("request")
                shot["provider_response"] = {
                    "prompt_id": response.get("prompt_id"),
                    "asset": response.get("asset"),
                    "workflow_name": response.get("workflow_name"),
                }
                raw_output_path = Path(response["output_path"])
                await loop.run_in_executor(
                    None,
                    functools.partial(
                        _mux_generated_video,
                        raw_output_path,
                        audio_path,
                        clip_out,
                        subtitle_path=srt_path if cfg["subtitle_mode"] == "hard_srt" else None,
                    ),
                )
            else:
                raise RuntimeError("local fallback requested")
        except Exception as exc:
            await flush_progress_futures()
            used_fallback = True
            logger.warning("ComfyUI render failed for project=%s shot=%s, falling back to local renderer: %s", project_id, shot["shot_id"], exc)
            scene_work_dir = preview_dir / f"scene_{index:03d}"
            scene_work_dir.mkdir(parents=True, exist_ok=True)
            fallback_scene_paths = await loop.run_in_executor(
                None,
                functools.partial(
                    render_scene_slides_v2,
                    [scene],
                    scene_work_dir,
                    render_with_strip,
                    animation_level,
                ),
            )
            if not fallback_scene_paths:
                raise
            slide_path = fallback_scene_paths[0]
            slide_is_video = animation_level == "high" and slide_path.suffix.lower() == ".webm"
            await loop.run_in_executor(
                None,
                functools.partial(
                    _make_clip,
                    slide_path,
                    audio_path,
                    clip_out,
                    srt_path if cfg["subtitle_mode"] == "hard_srt" else None,
                    slide_is_video,
                ),
            )
            shot["provider_request"] = {
                "provider": "local",
                "reason": "fallback" if cfg["broll_provider"] == "comfyui" else "local_requested",
            }
            shot["provider_response"] = {
                "provider": "local",
                "used_fallback": True,
            }

        shot["status"] = "muxed"
        shot["output_video_path"] = _to_public_path(clip_out)
        shot["error"] = ""
        shot["provider"] = "local" if used_fallback else cfg["broll_provider"]
        clip_paths.append(clip_out)
        project["metrics"] = _metrics_for_shots(shots)
        project["shots"] = shots
        settled_progress = _compute_visual_render_progress(
            shot_index=index + 1,
            shot_count=len(shots),
            provider_percent=0,
        )
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="visual_render",
            message=f"Rendered shot {index + 1}/{len(shots)}",
            progress=settled_progress,
            status="running",
        )
        project = await video_project_repo.find_project(project_id, user_id=user_id) or project
        project["metrics"] = _metrics_for_shots(shots)
        project["shots"] = shots
        project["updated_at"] = _utcnow()
        await video_project_repo.replace_project(project_id, user_id=user_id, document=project)

    if not clip_paths:
        raise RuntimeError("No clips were rendered successfully")

    await VideoProjectService.add_event(
        project_id,
        user_id=user_id,
        step="assemble",
        message="Assembling final video...",
        progress=RENDER_ASSEMBLE_PROGRESS,
        status="running",
    )

    intro_path = outro_path = thumbnail_path = None
    if cfg["brand_kit"] != "none":
        brand_preview_dir = preview_dir / "brand_preview"
        brand_preview_dir.mkdir(parents=True, exist_ok=True)
        first_slide_paths = await loop.run_in_executor(
            None,
            functools.partial(render_scene_slides_v2, [scenes[0]], brand_preview_dir, False, "off"),
        )
        first_slide = first_slide_paths[0] if first_slide_paths else None
        intro_path, outro_path, thumbnail_path = await loop.run_in_executor(
            None,
            functools.partial(
                build_brand_assets,
                cfg["brand_kit"],
                project.get("title", "Teaching Video"),
                first_slide,
                work_dir,
            ),
        )
        if intro_path and intro_path.exists():
            clip_paths.insert(0, intro_path)
        if outro_path and outro_path.exists():
            clip_paths.append(outro_path)

    final_mp4 = work_dir / f"{project_id}.mp4"
    await loop.run_in_executor(None, functools.partial(_concat_video, clip_paths, final_mp4))

    if cfg["avatar_mode"] != "none" and cfg["avatar_img_path"]:
        await VideoProjectService.add_event(
            project_id,
            user_id=user_id,
            step="publish",
            message="Applying avatar overlay...",
            progress=RENDER_PUBLISH_PROGRESS,
            status="running",
        )
        avatar_out = work_dir / f"{project_id}_avatar.mp4"
        avatar_image = Path(BACKEND_ROOT / "uploads" / "video_tmp" / Path(cfg["avatar_img_path"]).name)
        ok = await loop.run_in_executor(
            None,
            functools.partial(apply_avatar, final_mp4, avatar_image, avatar_out, cfg["avatar_mode"]),
        )
        if ok and avatar_out.exists():
            final_mp4 = avatar_out

    artifacts: dict[str, Any] = {
        "storyboard": {
            "filename": "storyboard.json",
            "public_path": "",
        },
        "final_video": {
            "filename": final_mp4.name,
            "public_path": _to_public_path(final_mp4),
        },
    }

    storyboard_path = work_dir / "storyboard.json"
    storyboard_path.write_text(
        json.dumps(
            {
                "title": project.get("title", ""),
                "scenes": scenes,
                "shots": shots,
                "provider_config": cfg,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    artifacts["storyboard"]["public_path"] = _to_public_path(storyboard_path)

    if thumbnail_path and Path(thumbnail_path).exists():
        artifacts["thumbnail"] = {
            "filename": Path(thumbnail_path).name,
            "public_path": _to_public_path(thumbnail_path),
        }

    if cfg["quiz_enabled"]:
        scene_clip_paths = [work_dir / f"clip_{i:03d}.mp4" for i in range(len(shots)) if (work_dir / f"clip_{i:03d}.mp4").exists()]
        intro_duration = probe_duration(intro_path) if intro_path and Path(intro_path).exists() else 0.0
        offsets = compute_scene_offsets(scene_clip_paths, intro_duration)
        chapters = generate_chapters(scenes, offsets)
        try:
            quiz_markers = await generate_quiz_markers(
                scenes,
                [scene.get("script", "") for scene in scenes],
                offsets,
                cfg["lang"],
                cfg["provider"],
            )
        except Exception:
            logger.warning("Quiz marker generation failed for project=%s", project_id, exc_info=True)
            quiz_markers = []
        chapters_path, quiz_path = save_quiz_data(work_dir, chapters, quiz_markers)
        artifacts["chapters"] = {
            "filename": Path(chapters_path).name,
            "public_path": _to_public_path(chapters_path),
        }
        artifacts["quiz"] = {
            "filename": Path(quiz_path).name,
            "public_path": _to_public_path(quiz_path),
        }

    refreshed = await video_project_repo.find_project(project_id, user_id=user_id)
    if not refreshed:
        raise RuntimeError("Video project disappeared before completion update")
    refreshed["shots"] = shots
    refreshed["artifacts"] = artifacts
    refreshed["metrics"] = _metrics_for_shots(shots)
    refreshed["latest_message"] = "Video ready!"
    refreshed["latest_error"] = ""
    refreshed["updated_at"] = _utcnow()
    refreshed["completed_at"] = _utcnow()
    refreshed["status"] = "completed"
    refreshed["progress"] = 100
    refreshed["current_step"] = "publish"
    await video_project_repo.replace_project(project_id, user_id=user_id, document=refreshed)
    await VideoProjectService.add_event(
        project_id,
        user_id=user_id,
        step="publish",
        message="Video ready!",
        progress=100,
        status="completed",
        event_type="step_done",
    )

    await save_history_record(
        tool="video",
        user_id=user_id,
        tool_name="video_project_render",
        params={
            "lang": cfg["lang"],
            "provider": cfg["provider"],
            "broll_provider": cfg["broll_provider"],
            "subtitles": cfg["subtitles"],
            "subtitle_mode": cfg["subtitle_mode"],
            "max_segments": cfg["max_segments"],
            "audience": cfg["audience"],
            "scene_count": len(scenes),
            "shot_count": len(shots),
            "title": project.get("title", ""),
        },
        result_preview="Video ready!",
        result_full={
            "project_id": project_id,
            "videoPath": artifacts["final_video"]["public_path"],
            "storyboardPath": artifacts["storyboard"]["public_path"],
        },
        source={
            "title": project.get("title", ""),
            "project_id": project_id,
            "source_filename": (project.get("source") or {}).get("source_filename", ""),
            "artifacts": artifacts,
        },
        expires_at=await compute_history_expires_at(user_id),
    )

