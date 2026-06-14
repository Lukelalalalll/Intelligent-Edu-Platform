from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute, APIWebSocketRoute

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_ROUTES_ROOT = _BACKEND_ROOT / "routes"
_SERVICES_ROOT = _BACKEND_ROOT / "services"

_ROUTE_DB_IMPORT_ALLOWLIST = {
    "routes/admin_routes/db_console.py",
}

_LONG_FILE_ALLOWLIST = {
    "routes/admin_routes/rag_eval.py",
    "routes/ai_gateway_routes/grading_context_helpers.py",
    "routes/ai_routes/chat_context_helpers.py",
    "routes/ai_routes/chat_providers.py",
    "routes/ai_routes/rag_orchestrator.py",
    "routes/questions_routes/generate.py",
    "routes/questions_routes/validators.py",
    "routes/slides_routes/delivery.py",
    "routes/slides_routes/editor.py",
    "routes/slides_routes/generation.py",
    "services/chat_service/room_service.py",
    "services/chat_service/transfer_dispatch_service.py",
    "services/rag_service/rag_eval_wizard_service.py",
    "services/slides/generation/chapter_summarizer.py",
    "services/slides/generation/diagram_generator.py",
    "services/slides/generation/img_chart_processor.py",
    "services/slides/html_renderer.py",
    "services/slides/infra/task_tracker.py",
    "services/slides/output/business_ppt_creator.py",
    "services/slides/output/editor_session/core.py",
    "services/slides/output/ppt_creator/core.py",
    "services/student_assignment_service.py",
    "services/video_service/render/html_renderer.py",
    "services/video_service/script.py",
}


def _route_signatures(routes):
    signatures: set[tuple[str, str, tuple[str, ...] | None]] = set()
    for route in routes:
        if isinstance(route, APIRoute):
            methods = tuple(sorted(route.methods or []))
            signatures.add(("http", route.path, methods))
        elif isinstance(route, APIWebSocketRoute):
            signatures.add(("ws", route.path, None))
    return signatures


def _assert_router_mounted(app, router, prefix: str) -> None:
    app_signatures = _route_signatures(app.routes)
    for kind, path, methods in _route_signatures(router.routes):
        expected = (kind, f"{prefix}{path}", methods)
        assert expected in app_signatures


def _relative_backend_path(path: Path) -> str:
    return str(path.relative_to(_BACKEND_ROOT)).replace("\\", "/")


def test_backend_main_aliases_core_app():
    from backend.main import app as legacy_app
    from backend.apps.core import app as core_app

    assert legacy_app is core_app


def test_provider_factory_returns_cached_singleton(monkeypatch):
    from backend.services.ai_gateway_service import provider_factory

    class DummyGateway:
        pass

    provider_factory.get_ai_gateway_service.cache_clear()
    monkeypatch.setattr(provider_factory, "AIGatewayService", DummyGateway)

    first = provider_factory.get_ai_gateway_service()
    second = provider_factory.get_default_service()

    assert isinstance(first, DummyGateway)
    assert first is second

    provider_factory.get_ai_gateway_service.cache_clear()


def test_core_dependencies_delegate_to_provider_factory(monkeypatch):
    from backend.core import dependencies

    marker = object()
    dependencies.get_ai_gateway_service.cache_clear()
    monkeypatch.setattr(dependencies, "_get_ai_gateway_service", lambda: marker)

    assert dependencies.get_ai_gateway_service() is marker
    assert dependencies.get_ai_gateway_service() is marker

    dependencies.get_ai_gateway_service.cache_clear()


def test_question_upload_service_writes_expected_metadata(tmp_path, monkeypatch):
    from backend.services.questions import file_lifecycle

    monkeypatch.setattr(file_lifecycle.Config, "UPLOAD_FOLDER_SUB2", str(tmp_path))
    monkeypatch.setattr(file_lifecycle.Config, "MAX_CONTENT_LENGTH", 1024)

    result = file_lifecycle.save_upload("worksheet.png", b"image-bytes")

    saved_path = Path(result["uploaded_file"])
    assert saved_path.exists()
    assert saved_path.read_bytes() == b"image-bytes"
    assert result["uploaded_filename"] == "worksheet.png"
    assert result["file_type"] == "image"
    assert result["total_pages"] == 0


def test_service_layer_does_not_import_route_packages():
    services_root = Path(__file__).resolve().parents[1] / "services"
    offenders: list[str] = []

    for path in services_root.rglob("*.py"):
        if path.name.endswith(".pyc"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "from backend.routes" in text or "import backend.routes" in text:
            offenders.append(str(path.relative_to(services_root.parent)))

    assert offenders == []


def test_core_app_mounts_expected_router_topology():
    from backend.apps.core import app
    from backend.routes.admin_routes import admin_router
    from backend.routes.ai_gateway_routes import ai_gateway_router
    from backend.routes.ai_routes import ai_router
    from backend.routes.auth_routes import auth_router
    from backend.routes.chat_routes import chat_router
    from backend.routes.file_center_routes import file_center_router
    from backend.routes.grading_routes import grading_router
    from backend.routes.homework_routes import router as homework_router
    from backend.routes.mailbox_routes import mailbox_router

    versioned_routers = (
        auth_router,
        admin_router,
        ai_router,
        mailbox_router,
        grading_router,
        ai_gateway_router,
        chat_router,
        file_center_router,
    )
    for router in versioned_routers:
        _assert_router_mounted(app, router, "/api/v1")
        _assert_router_mounted(app, router, "/api")

    _assert_router_mounted(app, homework_router, "")


def test_specialized_apps_mount_their_declared_routers():
    from backend.apps.highlighter import app as highlighter_app, highlighter_router
    from backend.apps.questions import app as questions_app
    from backend.apps.slides import app as slides_app
    from backend.apps.study_notes import app as study_notes_app
    from backend.apps.video import app as video_app
    from backend.apps.visual import app as visual_app
    from backend.routes.diagram_routes import diagram_router
    from backend.routes.image_extractor_routes import image_extractor_router
    from backend.routes.questions_routes import questions_router
    from backend.routes.slides_routes import legacy_sub1_router, public_slides_router, slides_router
    from backend.routes.study_notes_routes import study_notes_router
    from backend.routes.video_routes import router as video_router

    versioned_apps = (
        (questions_app, (questions_router,)),
        (slides_app, (slides_router, legacy_sub1_router)),
        (video_app, (video_router,)),
        (study_notes_app, (study_notes_router,)),
        (visual_app, (diagram_router, image_extractor_router)),
        (highlighter_app, (highlighter_router,)),
    )
    for app, routers in versioned_apps:
        for router in routers:
            _assert_router_mounted(app, router, "/api/v1")
            _assert_router_mounted(app, router, "/api")

    _assert_router_mounted(slides_app, public_slides_router, "")


def test_refactored_routes_do_not_import_db_or_direct_gateway_instances():
    route_files = [
        _BACKEND_ROOT / "routes" / "chat_routes" / "contacts.py",
        _BACKEND_ROOT / "routes" / "chat_routes" / "messages.py",
        _BACKEND_ROOT / "routes" / "chat_routes" / "rooms.py",
        _BACKEND_ROOT / "routes" / "chat_routes" / "ws.py",
        _BACKEND_ROOT / "routes" / "chat_routes" / "ai_actions.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "users.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "file_center.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "staff_codes.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "courses.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "courses_v2.py",
        _BACKEND_ROOT / "routes" / "admin_routes" / "file_assets.py",
        _BACKEND_ROOT / "routes" / "ai_routes" / "session.py",
        _BACKEND_ROOT / "routes" / "auth_routes" / "auth.py",
        _BACKEND_ROOT / "routes" / "auth_routes" / "student_v2.py",
        _BACKEND_ROOT / "routes" / "homework_routes" / "router.py",
        _BACKEND_ROOT / "routes" / "mailbox_routes" / "router.py",
        _BACKEND_ROOT / "routes" / "questions_routes" / "question_ops.py",
        _BACKEND_ROOT / "routes" / "slides_routes" / "delivery.py",
        _BACKEND_ROOT / "routes" / "study_notes_routes" / "room_notes.py",
        _BACKEND_ROOT / "routes" / "study_notes_routes" / "study_plan.py",
    ]

    for path in route_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        assert "from backend.core.database import db" not in text
        assert "AIGatewayService(" not in text


def test_student_v2_route_no_longer_imports_profile_route():
    route_path = _BACKEND_ROOT / "routes" / "auth_routes" / "student_v2.py"
    text = route_path.read_text(encoding="utf-8", errors="ignore")

    assert "from .profile import get_profile_courses" not in text


def test_route_layer_db_imports_are_allowlisted_only():
    offenders: set[str] = set()
    for path in _ROUTES_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "from backend.core.database import db" in text:
            offenders.add(_relative_backend_path(path))

    unexpected = offenders - _ROUTE_DB_IMPORT_ALLOWLIST
    assert unexpected == set()


def test_direct_ai_gateway_instantiation_only_happens_in_provider_factory():
    allowlist = {"services/ai_gateway_service/provider_factory.py"}
    offenders: set[str] = set()

    for root in (_ROUTES_ROOT, _SERVICES_ROOT):
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "AIGatewayService(" in text:
                offenders.add(_relative_backend_path(path))

    unexpected = offenders - allowlist
    assert unexpected == set()


@pytest.mark.parametrize(
    ("root", "threshold"),
    (
        (_ROUTES_ROOT, 250),
        (_SERVICES_ROOT, 350),
    ),
)
def test_long_files_are_explicitly_allowlisted(root: Path, threshold: int):
    offenders: set[str] = set()
    for path in root.rglob("*.py"):
        line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        if line_count > threshold:
            offenders.add(_relative_backend_path(path))

    unexpected = offenders - _LONG_FILE_ALLOWLIST
    assert unexpected == set()
