from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.core.security import get_current_user
from backend.routes.slides_routes import artifacts, layout_preview, observability


def _build_app(*, router, prefix: str) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix=prefix)
    return app


def test_slides_download_requires_auth():
    app = _build_app(router=artifacts.router, prefix="/api/slides")

    with TestClient(app) as client:
        response = client.get("/api/slides/download_ppt/example.pptx")

    assert response.status_code == 401


def test_layout_preview_direct_route_requires_auth():
    app = _build_app(router=layout_preview.public_router, prefix="/slides")

    with TestClient(app) as client:
        response = client.get("/slides/layout-preview", params={"theme": "Business", "layout": "Safe Layout"})

    assert response.status_code == 401


def test_layout_preview_rejects_traversal_inputs(monkeypatch, tmp_path):
    app = _build_app(router=layout_preview.public_router, prefix="/slides")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "teacher"}

    templates_dir = tmp_path / "ppt_templates"
    templates_dir.mkdir(parents=True)
    (templates_dir / "Business.pptx").write_bytes(b"placeholder")

    monkeypatch.setattr(layout_preview.Config, "PPT_TEMPLATES_FOLDER", str(templates_dir))
    monkeypatch.setattr(layout_preview, "_get_layout_names", lambda _path: ["Safe Layout"])

    with TestClient(app) as client:
        bad_theme = client.get(
            "/slides/layout-preview",
            params={"theme": "..%2F..%2Fsecret", "layout": "Safe Layout"},
        )
        bad_layout = client.get(
            "/slides/layout-preview",
            params={"theme": "Business", "layout": "..%2F..%2Fevil"},
        )

    assert bad_theme.status_code == 404
    assert bad_layout.status_code == 404


@pytest.mark.asyncio
async def test_observability_stats_scope_non_admin_user(monkeypatch):
    get_stats = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(observability.TaskTracker, "get_stats", get_stats)

    result = await observability.get_pipeline_stats(hours=12, user={"id": "user-1", "role": "teacher"})

    assert result == {"ok": True}
    assert get_stats.await_args.kwargs == {"hours": 12, "user_id": "user-1"}


@pytest.mark.asyncio
async def test_observability_hides_other_users_tasks(monkeypatch):
    get_task = AsyncMock(return_value=None)
    monkeypatch.setattr(observability.TaskTracker, "get_task", get_task)

    with pytest.raises(HTTPException) as excinfo:
        await observability.get_task_timeline("req-1", user={"id": "user-2", "role": "teacher"})

    assert excinfo.value.status_code == 404
    assert get_task.await_args.kwargs == {"user_id": "user-2"}


@pytest.mark.asyncio
async def test_observability_delete_checkpoints_requires_admin(monkeypatch):
    with pytest.raises(HTTPException) as excinfo:
        await observability.delete_checkpoints("task-1", user={"id": "user-1", "role": "teacher"})

    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_observability_admin_delete_checkpoints(monkeypatch):
    fake_manager = SimpleNamespace(delete_task=AsyncMock(return_value=3))
    monkeypatch.setattr(observability, "_checkpoint_manager_cls", lambda: fake_manager)

    result = await observability.delete_checkpoints("task-1", user={"id": "admin-1", "role": "admin"})

    assert result == {"deleted": 3}
    fake_manager.delete_task.assert_awaited_once_with("task-1")


@pytest.mark.asyncio
async def test_observability_audit_log_scopes_non_admin(monkeypatch):
    fake_audit = SimpleNamespace(get_logs=AsyncMock(return_value=[{"action": "render"}]))
    monkeypatch.setattr(observability, "_audit_logger_cls", lambda: fake_audit)

    result = await observability.get_audit_log(hours=24, action=None, limit=20, user={"id": "user-7", "role": "teacher"})

    assert result["count"] == 1
    assert result["logs"][0]["action"] == "render"
    assert fake_audit.get_logs.await_args.kwargs["user_id"] == "user-7"
