from __future__ import annotations

import copy
from pathlib import Path
from types import SimpleNamespace

from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.apps.factory import create_app
from backend.apps.manifests import CORE_APP_MANIFEST
from backend.core.security import get_current_user
from backend.routes.video_routes.projects import router as projects_router
from backend.services.video_service.comfyui_adapter import ComfyUIWanVideoAdapter
from backend.services.video_service.project_service import (
    VideoProjectService,
    _compat_status_payload,
    _compute_visual_render_progress,
    _render_video_project,
)


async def _fake_current_user():
    return {"id": "user-1"}


def _build_projects_app() -> FastAPI:
    app = FastAPI()
    app.include_router(projects_router, prefix="/video")
    app.dependency_overrides[get_current_user] = _fake_current_user
    return app


def test_video_project_create_returns_serialized_id(monkeypatch):
    inserted_id = ObjectId()

    async def _fake_insert_project(document):
        return SimpleNamespace(inserted_id=inserted_id)

    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.insert_project",
        _fake_insert_project,
    )

    project = _run(
        VideoProjectService.create_project(
            user_id="user-1",
            title="Course Intro",
            source_text="hello world",
        )
    )

    assert project["id"] == str(inserted_id)
    assert project["title"] == "Course Intro"
    assert project["status"] == "draft"


def test_patch_project_ignores_provider_defaults_when_not_supplied(monkeypatch):
    captured: dict[str, object] = {}

    async def _fake_update_project(project_id, *, user_id, title=None, scenes=None, provider_config=None):
        captured.update(
            {
                "project_id": project_id,
                "user_id": user_id,
                "title": title,
                "scenes": scenes,
                "provider_config": provider_config,
            }
        )
        return {"id": project_id, "title": title or "Untitled"}

    monkeypatch.setattr(VideoProjectService, "update_project", staticmethod(_fake_update_project))

    with TestClient(_build_projects_app()) as client:
        response = client.patch("/video/projects/project-1", json={"title": "Revised title"})

    assert response.status_code == 200
    assert captured["project_id"] == "project-1"
    assert captured["provider_config"] is None
    assert captured["title"] == "Revised title"


def test_list_projects_route_returns_page(monkeypatch):
    async def _fake_list_projects(*, user_id, page, page_size):
        assert user_id == "user-1"
        assert page == 1
        assert page_size == 20
        return {
            "items": [{"id": "project-1", "title": "Demo"}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }

    monkeypatch.setattr(VideoProjectService, "list_projects", staticmethod(_fake_list_projects))

    with TestClient(_build_projects_app()) as client:
        response = client.get("/video/projects")

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["id"] == "project-1"
    assert body["total"] == 1


def test_plan_project_route_returns_project(monkeypatch):
    async def _fake_plan_project(project_id, *, user_id):
        assert project_id == "project-1"
        assert user_id == "user-1"
        return {"id": project_id, "status": "planned", "title": "Planned"}

    monkeypatch.setattr(VideoProjectService, "plan_project", staticmethod(_fake_plan_project))

    with TestClient(_build_projects_app()) as client:
        response = client.post("/video/projects/project-1/plan")

    assert response.status_code == 200
    assert response.json()["project"]["status"] == "planned"


def test_update_project_source_route_passes_multipart_payload(monkeypatch):
    captured: dict[str, object] = {}

    async def _fake_update_project_source(
        project_id,
        *,
        user_id,
        title=None,
        source_mode="text",
        text=None,
        source_filename="",
        uploaded_file_path="",
        file_type="",
    ):
        captured.update(
            {
                "project_id": project_id,
                "user_id": user_id,
                "title": title,
                "source_mode": source_mode,
                "text": text,
                "source_filename": source_filename,
                "uploaded_file_path": uploaded_file_path,
                "file_type": file_type,
            }
        )
        return {"id": project_id, "title": title or "Updated", "status": "draft"}

    monkeypatch.setattr(
        VideoProjectService,
        "update_project_source",
        staticmethod(_fake_update_project_source),
    )

    with TestClient(_build_projects_app()) as client:
        response = client.post(
            "/video/projects/project-1/source",
            data={
                "title": "Updated source",
                "source_mode": "text",
                "text": "fresh lesson brief",
            },
        )

    assert response.status_code == 200
    assert captured["project_id"] == "project-1"
    assert captured["user_id"] == "user-1"
    assert captured["title"] == "Updated source"
    assert captured["source_mode"] == "text"
    assert captured["text"] == "fresh lesson brief"


def test_update_project_source_resets_downstream_state(monkeypatch):
    existing_project = {
        "_id": ObjectId(),
        "user_id": "user-1",
        "title": "Old title",
        "source": {
            "kind": "text",
            "text": "old source",
            "source_filename": "",
            "file_type": "",
            "uploaded_file_path": "",
        },
        "provider_config": {},
        "storyboard": {"scripts": ["old"], "scene_count": 1, "shot_count": 1},
        "scenes": [{"id": "scene-1"}],
        "shots": [{"shot_id": "shot-1"}],
        "artifacts": {"final_video": {"public_path": "artifacts/video.mp4"}},
        "metrics": {"scene_count": 1, "shot_count": 1},
        "status": "completed",
        "progress": 100,
    }
    captured: dict[str, object] = {}

    async def _fake_find_project(project_id, *, user_id=None):
        assert project_id == "project-1"
        assert user_id == "user-1"
        return existing_project

    async def _fake_update_project(project_id, *, user_id=None, set_fields=None, unset_fields=None):
        captured["project_id"] = project_id
        captured["user_id"] = user_id
        captured["set_fields"] = set_fields or {}
        captured["unset_fields"] = unset_fields or {}
        return {"_id": existing_project["_id"], **existing_project, **(set_fields or {})}

    async def _fake_add_event(*args, **kwargs):
        set_fields = captured["set_fields"]
        return {
            "_id": existing_project["_id"],
            **existing_project,
            **set_fields,
            "events": [
                {
                    "type": "step_start",
                    "step": "draft",
                    "message": "Project source updated",
                }
            ],
            "latest_message": "Project source updated",
        }

    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.find_project",
        _fake_find_project,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.update_project",
        _fake_update_project,
    )
    monkeypatch.setattr(VideoProjectService, "add_event", staticmethod(_fake_add_event))

    updated = _run(
        VideoProjectService.update_project_source(
            "project-1",
            user_id="user-1",
            title="New title",
            source_mode="text",
            text="new source text",
        )
    )

    assert updated is not None
    set_fields = captured["set_fields"]
    assert set_fields["title"] == "New title"
    assert set_fields["source"]["kind"] == "text"
    assert set_fields["source"]["text"] == "new source text"
    assert set_fields["status"] == "draft"
    assert set_fields["progress"] == 0
    assert set_fields["storyboard"]["scripts"] == []
    assert set_fields["scenes"] == []
    assert set_fields["shots"] == []
    assert set_fields["artifacts"] == {}
    assert set_fields["metrics"]["scene_count"] == 0
    assert captured["unset_fields"] == {"current_run": ""}


def test_update_project_preserves_ai_scene_prompt_metadata(monkeypatch):
    existing_project = {
        "_id": ObjectId(),
        "user_id": "user-1",
        "title": "Lesson",
        "source": {"kind": "text", "text": "lesson source"},
        "provider_config": {"default_negative_prompt": "blurry"},
        "scenes": [],
        "shots": [],
        "storyboard": {},
        "metrics": {},
    }
    captured: dict[str, object] = {}

    async def _fake_find_project(project_id, *, user_id=None):
        assert project_id == "project-1"
        assert user_id == "user-1"
        return existing_project

    async def _fake_update_project(project_id, *, user_id=None, set_fields=None, unset_fields=None):
        captured["project_id"] = project_id
        captured["user_id"] = user_id
        captured["set_fields"] = set_fields or {}
        return {"_id": existing_project["_id"], **existing_project, **(set_fields or {})}

    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.find_project",
        _fake_find_project,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.update_project",
        _fake_update_project,
    )

    updated = _run(
        VideoProjectService.update_project(
            "project-1",
            user_id="user-1",
            scenes=[
                {
                    "id": "scene-1",
                    "script": "Introduce the modern university campus.",
                    "slideMode": "theme",
                    "themeId": "dark-ocean",
                    "slideTitle": "Campus Overview",
                    "slideBody": "- Students move between buildings\n- Library and labs support learning",
                    "layoutType": "image-top",
                    "toneMode": "lecture",
                    "visualPrompt": "Wide cinematic sunrise view of a modern university campus, students crossing the plaza, glass library in the background, gentle camera glide, clean academic atmosphere.",
                    "negativePrompt": "crowded text overlays",
                    "shotType": "broll",
                    "durationSeconds": 5,
                }
            ],
        )
    )

    assert updated is not None
    set_fields = captured["set_fields"]
    assert set_fields["scenes"][0]["visualPrompt"].startswith("Wide cinematic sunrise view")
    assert set_fields["scenes"][0]["durationSeconds"] == 5
    assert set_fields["shots"][0]["visual_prompt"].startswith("Wide cinematic sunrise view")
    assert set_fields["shots"][0]["negative_prompt"] == "crowded text overlays, blurry"
    assert set_fields["shots"][0]["duration_seconds"] == 5
    assert set_fields["shots"][0]["shot_type"] == "broll"


def test_plan_project_uses_ai_scene_visual_generation(monkeypatch):
    existing_project = {
        "_id": ObjectId(),
        "user_id": "user-1",
        "title": "University Scene",
        "status": "draft",
        "progress": 0,
        "current_step": "draft",
        "latest_message": "Project created",
        "latest_error": "",
        "source": {
            "kind": "text",
            "text": "Generate a university scene showing the campus environment for a course introduction.",
            "source_filename": "",
            "file_type": "",
            "uploaded_file_path": "",
        },
        "provider_config": {
            "provider": "deepseek",
            "lang": "en",
            "audience": "student",
            "max_segments": 4,
            "default_negative_prompt": "blurry",
        },
        "storyboard": {},
        "scenes": [],
        "shots": [],
        "artifacts": {},
        "metrics": {},
        "events": [],
    }
    captured: dict[str, object] = {}

    async def _fake_find_project(project_id, *, user_id=None):
        assert project_id == "project-1"
        assert user_id == "user-1"
        return existing_project

    async def _fake_find_user_by_id(user_id, projection=None):
        assert user_id == "user-1"
        return {"_id": ObjectId(), "id": "user-1", "username": "demo"}

    async def _fake_update_project(project_id, *, user_id=None, set_fields=None, unset_fields=None):
        captured["set_fields"] = set_fields or {}
        return {"_id": existing_project["_id"], **existing_project, **(set_fields or {})}

    async def _fake_add_event(*args, **kwargs):
        return None

    async def _fake_smart_extract(**kwargs):
        assert kwargs["provider"] == "deepseek"
        return ["Introduce the campus with an inviting visual overview."]

    async def _fake_generate_slide_contents(scripts, source_text, lang, provider, audience, user=None):
        assert provider == "deepseek"
        assert user is not None
        return [
            {
                "title": "Campus Introduction",
                "bullets": ["Students arriving", "Library facade", "Open central plaza"],
                "layoutType": "image-top",
            }
        ]

    async def _fake_generate_scene_visuals(scenes, source_text, *, lang, provider, audience, user=None):
        assert provider == "deepseek"
        assert scenes[0]["slideTitle"] == "Campus Introduction"
        assert user is not None
        return [
            {
                "visualPrompt": "Cinematic aerial sweep over a modern university campus at golden hour, students walking through an open plaza, library glass reflecting warm light, calm forward motion, polished academic atmosphere.",
                "negativePrompt": "text overlays",
                "shotType": "broll",
                "durationSeconds": 6,
            }
        ]

    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.find_project",
        _fake_find_project,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.user_repo.find_by_id",
        _fake_find_user_by_id,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.update_project",
        _fake_update_project,
    )
    monkeypatch.setattr(VideoProjectService, "add_event", staticmethod(_fake_add_event))
    monkeypatch.setattr("backend.services.video_service.project_service.smart_extract", _fake_smart_extract)
    monkeypatch.setattr(
        "backend.services.video_service.project_service.generate_slide_contents",
        _fake_generate_slide_contents,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.generate_scene_visuals",
        _fake_generate_scene_visuals,
    )

    updated = _run(VideoProjectService.plan_project("project-1", user_id="user-1"))

    assert updated is not None
    set_fields = captured["set_fields"]
    assert set_fields["status"] == "planned"
    assert set_fields["scenes"][0]["visualPrompt"].startswith("Cinematic aerial sweep")
    assert set_fields["scenes"][0]["shotType"] == "broll"
    assert set_fields["shots"][0]["visual_prompt"].startswith("Cinematic aerial sweep")
    assert set_fields["shots"][0]["negative_prompt"] == "text overlays, blurry"
    assert set_fields["shots"][0]["duration_seconds"] == 6
    assert set_fields["storyboard"]["scene_count"] == 1


def test_compat_status_maps_completed_to_done():
    payload = _compat_status_payload(
        {
            "status": "completed",
            "progress": 100,
            "latest_message": "Video ready!",
            "latest_error": "",
            "artifacts": {
                "final_video": {"public_path": "backend/generated/video.mp4"},
                "thumbnail": {"public_path": "backend/generated/thumb.png"},
            },
            "shots": [],
        }
    )

    assert payload["status"] == "done"
    assert payload["videoPath"] == "backend/generated/video.mp4"
    assert payload["thumbnailPath"] == "backend/generated/thumb.png"


def test_visual_render_progress_scales_with_provider_progress():
    start_progress = _compute_visual_render_progress(shot_index=0, shot_count=2, provider_percent=0)
    mid_progress = _compute_visual_render_progress(shot_index=0, shot_count=2, provider_percent=50)
    done_progress = _compute_visual_render_progress(shot_index=2, shot_count=2, provider_percent=0)

    assert start_progress == 30
    assert mid_progress > start_progress
    assert done_progress == 82


def test_comfyui_progress_message_parsing_supports_progress_and_progress_state():
    adapter = ComfyUIWanVideoAdapter()

    progress_message = adapter._parse_progress_message(
        '{"type":"progress","data":{"value":3,"max":30,"prompt_id":"prompt-1","node":"3"}}',
        "prompt-1",
    )
    progress_state_message = adapter._parse_progress_message(
        '{"type":"progress_state","data":{"prompt_id":"prompt-1","nodes":{"3":{"value":6,"max":30,"state":"running"},"9":{"value":1,"max":1,"state":"finished"}}}}',
        "prompt-1",
    )

    assert progress_message is not None
    assert progress_message["progress_percent"] == 10
    assert progress_message["node"] == "3"
    assert progress_state_message is not None
    assert progress_state_message["progress_percent"] == 20
    assert progress_state_message["node"] == "3"


def test_render_project_keeps_live_progress_when_comfyui_reports_updates(monkeypatch, tmp_path):
    project_id = "507f1f77bcf86cd799439011"
    project_store = {
        "_id": ObjectId(project_id),
        "user_id": "user-1",
        "title": "Campus Lesson",
        "status": "queued",
        "progress": 2,
        "current_step": "queued",
        "latest_message": "Render job enqueued",
        "latest_error": "",
        "source": {"kind": "text", "text": "campus", "source_filename": "", "file_type": "", "uploaded_file_path": ""},
        "provider_config": {
            "lang": "en",
            "provider": "deepseek",
            "audience": "student",
            "subtitles": False,
            "subtitle_mode": "none",
            "brand_kit": "none",
            "animation_level": "off",
            "tts_engine": "edge_tts",
            "avatar_mode": "none",
            "avatar_img_path": "",
            "quiz_enabled": False,
            "max_segments": 3,
            "broll_provider": "comfyui",
            "default_negative_prompt": "",
        },
        "storyboard": {"scripts": ["Scene narration"], "scene_count": 1, "shot_count": 1},
        "scenes": [
            {
                "id": "scene-1",
                "script": "Scene narration",
                "slideTitle": "Scene 1",
                "toneMode": "lecture",
            }
        ],
        "shots": [
            {
                "shot_id": "shot-1",
                "scene_id": "scene-1",
                "scene_order": 1,
                "shot_order": 1,
                "shot_type": "broll",
                "duration_seconds": 4,
                "visual_prompt": "A cinematic campus establishing shot",
                "negative_prompt": "",
                "narration_text": "Scene narration",
                "status": "pending",
                "provider": "",
                "audio_path": "",
                "output_video_path": "",
                "error": "",
                "provider_request": None,
                "provider_response": None,
            }
        ],
        "artifacts": {},
        "metrics": {"scene_count": 1, "shot_count": 1, "status_counts": {"pending": 1}, "completed_shots": 0, "failed_shots": 0},
        "events": [],
    }
    replace_progresses: list[int] = []

    async def _fake_find_project(project_id_arg, *, user_id=None):
        assert project_id_arg == project_id
        assert user_id == "user-1"
        return copy.deepcopy(project_store)

    async def _fake_replace_project(project_id_arg, *, user_id=None, document=None):
        assert project_id_arg == project_id
        assert user_id == "user-1"
        assert document is not None
        replace_progresses.append(int(document.get("progress") or 0))
        project_store.clear()
        project_store.update(copy.deepcopy(document))
        return copy.deepcopy(project_store)

    async def _fake_add_event(
        project_id_arg,
        *,
        user_id,
        step,
        message,
        event_type="step_progress",
        progress=None,
        status=None,
        latest_error=None,
        payload=None,
    ):
        assert project_id_arg == project_id
        assert user_id == "user-1"
        event = {
            "type": event_type,
            "step": step,
            "message": message,
            "payload": payload or {},
        }
        if progress is not None:
            event["progress"] = progress
            project_store["progress"] = progress
        if status is not None:
            project_store["status"] = status
        project_store["current_step"] = step
        project_store["latest_message"] = message
        if latest_error is not None:
            project_store["latest_error"] = latest_error
        project_store.setdefault("events", []).append(event)
        return copy.deepcopy(project_store)

    async def _fake_scripts_to_audio(*args, **kwargs):
        audio_path = tmp_path / "scene_000.mp3"
        audio_path.write_bytes(b"audio")
        return [audio_path], [None]

    def _fake_render_broll_to_file(self, **kwargs):
        progress_callback = kwargs.get("progress_callback")
        output_path = Path(kwargs["output_path"])
        output_path.write_bytes(b"raw-video")
        if progress_callback is not None:
            progress_callback({"source": "progress", "node": "3", "progress_percent": 10})
            progress_callback({"source": "progress", "node": "3", "progress_percent": 40})
        return {
            "request": {"prompt": kwargs["prompt"]},
            "prompt_id": "prompt-1",
            "asset": {"filename": output_path.name, "subfolder": "", "type": "output"},
            "workflow_name": "text_to_video_wan",
            "output_path": str(output_path),
        }

    def _fake_mux_generated_video(_raw_output_path, _audio_path, clip_out, subtitle_path=None):
        Path(clip_out).write_bytes(b"clip")

    def _fake_concat_video(_clip_paths, final_mp4):
        Path(final_mp4).write_bytes(b"final")

    async def _fake_save_history_record(**kwargs):
        return None

    async def _fake_compute_history_expires_at(_user_id):
        return None

    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.find_project",
        _fake_find_project,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.video_project_repo.replace_project",
        _fake_replace_project,
    )
    monkeypatch.setattr(VideoProjectService, "add_event", staticmethod(_fake_add_event))
    monkeypatch.setattr(
        "backend.services.video_service.tts.scripts_to_audio",
        _fake_scripts_to_audio,
    )
    monkeypatch.setattr(
        "backend.services.video_service.comfyui_adapter.ComfyUIWanVideoAdapter.render_broll_to_file",
        _fake_render_broll_to_file,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service._mux_generated_video",
        _fake_mux_generated_video,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service._concat_video",
        _fake_concat_video,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.save_history_record",
        _fake_save_history_record,
    )
    monkeypatch.setattr(
        "backend.services.video_service.project_service.compute_history_expires_at",
        _fake_compute_history_expires_at,
    )

    _run(_render_video_project(project_id, user_id="user-1"))

    comfy_progress_events = [
        event for event in project_store["events"] if event.get("payload", {}).get("comfyui_progress") is not None
    ]
    assert comfy_progress_events
    assert comfy_progress_events[0]["payload"]["comfyui_progress"] == 10
    assert comfy_progress_events[0]["progress"] > 2
    assert replace_progresses
    assert all(progress >= 28 for progress in replace_progresses)
    assert project_store["status"] == "completed"
    assert project_store["progress"] == 100


def test_comfyui_workflow_compile_injects_text_to_video_wan_fields():
    adapter = ComfyUIWanVideoAdapter()
    workflow = adapter._load_workflow()

    compiled = adapter._compile_workflow(
        workflow,
        prompt="a calm classroom pan shot",
        negative_prompt="blurry",
        width=832,
        height=480,
        fps=16,
        frames=65,
        seed=12345,
        output_prefix="lesson_clip",
    )

    assert compiled["6"]["inputs"]["text"] == "a calm classroom pan shot"
    assert compiled["7"]["inputs"]["text"] == "blurry"
    assert compiled["40"]["inputs"]["width"] == 832
    assert compiled["40"]["inputs"]["height"] == 480
    assert compiled["40"]["inputs"]["length"] == 65
    assert compiled["3"]["inputs"]["seed"] == 12345
    assert compiled["50"]["inputs"]["filename_prefix"] == "lesson_clip"


def test_core_app_manifest_wires_video_project_routes():
    app = create_app(**CORE_APP_MANIFEST.create_app_kwargs())
    paths = {getattr(route, "path", "") for route in app.routes}

    assert "/api/video/projects" in paths
    assert "/api/v1/video/projects" in paths


def _run(coro):
    import asyncio

    return asyncio.get_event_loop().run_until_complete(coro)
