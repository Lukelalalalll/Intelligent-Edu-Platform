from __future__ import annotations

from pathlib import Path
import re

import pytest
from fastapi.routing import APIRoute, APIWebSocketRoute

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_ROUTES_ROOT = _BACKEND_ROOT / "routes"
_SERVICES_ROOT = _BACKEND_ROOT / "services"
_ARCHITECTURE_FACADES_ROOT = _BACKEND_ROOT / "application" / "architecture_facades"
_PRESENTATION_ENDPOINT_ROOT = _BACKEND_ROOT / "presenton_runtime" / "api" / "v1" / "ppt" / "endpoints" / "presentation"

_ROUTE_DB_IMPORT_ALLOWLIST = {
    "routes/admin_routes/db_console.py",
}

_SERVICE_DOMAIN_NAMES = {
    "admin",
    "ai",
    "auth",
    "files",
    "homework",
    "presenton",
    "questions",
    "rag",
    "slides",
    "student",
    "study",
    "visual",
}

_SERVICE_CROSS_DOMAIN_IMPORT_ALLOWLIST = {
    ("services/admin/admin_security_service.py", "auth"),
    ("services/admin/admin_user_service.py", "auth"),
    ("services/ai/ai_session_service.py", "auth"),
    ("services/ai/ai_session_service.py", "files"),
    ("services/student/student_assignment_service.py", "auth"),
    ("services/student/student_assignment_service.py", "files"),
}

_LONG_FILE_ALLOWLIST = {
    "routes/admin_routes/rag_eval.py",
    "routes/ai_gateway_routes/grading_context_helpers.py",
    "routes/ai_routes/chat_context_helpers.py",
    "routes/ai_routes/chat_providers.py",
    "routes/ai_routes/rag_orchestrator.py",
    "routes/questions_routes/generate.py",
    "routes/questions_routes/validators.py",
    "services/chat_service/room_service.py",
    "services/chat_service/transfer_dispatch_service.py",
    "services/ai/ai_session_service.py",
    "services/auth/google_auth_service.py",
    "services/rag_service/rag_eval_wizard_service.py",
    "services/slides/html_renderer.py",
    "services/slides/infra/task_tracker.py",
    "services/slides/output/ppt_creator/core.py",
    "services/student/student_assignment_service.py",
    "services/video_service/render/html_renderer.py",
}

_ROOT_SERVICE_FILE_ALLOWLIST = {
    "__init__.py",
    "background_job_dispatcher.py",
    "background_job_runtime.py",
    "grading_normalizer.py",
    "history_service.py",
    "mailbox_service.py",
    "secret_storage.py",
}

_ARCHITECTURE_IMPL_LONG_ALLOWLIST = {
    "application/architecture_facades/course_rag_chunking_impl.py",
    "application/architecture_facades/course_rag_indexing_service_impl.py",
    "application/architecture_facades/course_rag_retrieval_helpers_impl.py",
    "application/architecture_facades/course_rag_store_manager_impl.py",
}

_ARCHITECTURE_HELPER_ROOTS = (
    _ARCHITECTURE_FACADES_ROOT / "indexing_job",
    _ARCHITECTURE_FACADES_ROOT / "indexing_job_extractors",
    _ARCHITECTURE_FACADES_ROOT / "course_rag_retrieval",
    _ARCHITECTURE_FACADES_ROOT / "auth_session",
    _ARCHITECTURE_FACADES_ROOT / "user_profile",
    _ARCHITECTURE_FACADES_ROOT / "auth_account",
    _ARCHITECTURE_FACADES_ROOT / "course_rag_opensearch_sparse_retriever",
)

_PRESENTON_HELPER_ROOTS = (
    _BACKEND_ROOT / "presenton_runtime" / "services" / "export_task",
    _BACKEND_ROOT / "presenton_runtime" / "services" / "chat" / "memory_layer_support",
    _BACKEND_ROOT / "presenton_runtime" / "services" / "chat" / "service_support",
    _BACKEND_ROOT / "presenton_runtime" / "services" / "chat" / "tools_support",
    _BACKEND_ROOT / "services" / "presenton" / "presenton_projection",
)

_PRESENTON_ENDPOINT_HELPER_ROOTS = (
    _BACKEND_ROOT / "presenton_runtime" / "api" / "v1" / "ppt" / "endpoints" / "pptx_slides_support",
)

_PRESENTON_TEMPLATE_HELPER_ROOTS = (
    _BACKEND_ROOT / "presenton_runtime" / "templates" / "fonts_and_slides_preview_support",
    _BACKEND_ROOT / "presenton_runtime" / "templates" / "get_layout_by_name_support",
    _BACKEND_ROOT / "presenton_runtime" / "templates" / "handler_support",
    _BACKEND_ROOT / "presenton_runtime" / "templates" / "pptx_font_utils_support",
)

_SERVICE_HELPER_ROOTS = (
    _BACKEND_ROOT / "services" / "video_service" / "script_support",
    _BACKEND_ROOT / "services" / "slides" / "output" / "business_ppt_creator_support",
)

_EXPLICIT_LINE_BOUNDS = {
    "application/architecture_facades/course_rag_retrieval_service_impl.py": 200,
    "application/architecture_facades/auth_session_service_impl.py": 200,
    "application/architecture_facades/user_profile_service_impl.py": 200,
    "presenton_runtime/services/export_task_service.py": 200,
    "presenton_runtime/services/chat/memory_layer.py": 200,
    "presenton_runtime/api/v1/ppt/endpoints/pptx_slides.py": 200,
    "services/presenton/presenton_projection_service.py": 200,
    "presenton_runtime/templates/fonts_and_slides_preview.py": 200,
    "presenton_runtime/templates/handler.py": 200,
    "presenton_runtime/templates/pptx_font_utils.py": 200,
    "presenton_runtime/services/chat/service.py": 200,
    "presenton_runtime/services/chat/tools.py": 200,
    "services/video_service/script.py": 200,
    "services/slides/output/business_ppt_creator.py": 200,
    "application/architecture_facades/auth_account_service_impl.py": 200,
    "application/architecture_facades/course_rag_opensearch_sparse_retriever_impl.py": 200,
    "presenton_runtime/templates/get_layout_by_name.py": 200,
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


def test_root_services_only_expose_cross_domain_infra_modules():
    actual = {path.name for path in _SERVICES_ROOT.glob("*.py")}
    assert actual == _ROOT_SERVICE_FILE_ALLOWLIST


def test_architecture_facades_do_not_import_route_packages():
    offenders: set[str] = set()
    for path in _ARCHITECTURE_FACADES_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "from backend.routes" in text or "import backend.routes" in text:
            offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_architecture_facades_do_not_parse_http_request_shapes():
    fastapi_pattern = re.compile(r"from\s+fastapi\s+import\s+[^\n]*\b(APIRouter|Body|Query|Path|Depends)\b")
    offenders: dict[str, list[str]] = {}
    for path in _ARCHITECTURE_FACADES_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits: list[str] = []
        if fastapi_pattern.search(text):
            hits.append("fastapi-http-schema-import")
        if "Annotated[" in text:
            hits.append("Annotated[")
        if hits:
            offenders[_relative_backend_path(path)] = hits
    assert offenders == {}


def test_domain_services_only_use_explicitly_allowlisted_cross_domain_imports():
    pattern = re.compile(r"(?:from|import)\s+backend\.services\.([a-z_]+)\b")
    offenders: set[tuple[str, str]] = set()

    for domain_root in sorted(_SERVICE_DOMAIN_NAMES):
        root = _SERVICES_ROOT / domain_root
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            relative_path = _relative_backend_path(path)
            text = path.read_text(encoding="utf-8", errors="ignore")
            for imported_domain in pattern.findall(text):
                if imported_domain not in _SERVICE_DOMAIN_NAMES or imported_domain == domain_root:
                    continue
                entry = (relative_path, imported_domain)
                if entry not in _SERVICE_CROSS_DOMAIN_IMPORT_ALLOWLIST:
                    offenders.add(entry)

    assert offenders == set()


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


def test_slides_routes_use_explicit_router_aggregation():
    slides_routes_root = _ROUTES_ROOT / "slides_routes"
    package_init = (slides_routes_root / "__init__.py").read_text(encoding="utf-8", errors="ignore")

    assert "include_router(" in package_init
    assert "slides_router.include_router(router)" in package_init
    assert "public_slides_router.include_router(router)" in package_init
    assert "legacy_sub1_router.include_router(legacy_router)" in package_init

    offenders: set[str] = set()
    for path in slides_routes_root.rglob("*.py"):
        if path.name in {"__init__.py", "router.py"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "from .router import slides_router" in text:
            offenders.add(_relative_backend_path(path))
        if "from .router import public_slides_router" in text:
            offenders.add(_relative_backend_path(path))
        if "from .router import legacy_sub1_router" in text:
            offenders.add(_relative_backend_path(path))
        if "slides_router.include_router(" in text:
            offenders.add(_relative_backend_path(path))
        if "public_slides_router.include_router(" in text:
            offenders.add(_relative_backend_path(path))
        if "legacy_sub1_router.include_router(" in text:
            offenders.add(_relative_backend_path(path))

    assert offenders == set()


def test_route_packages_do_not_use_import_side_effect_registration():
    package_inits = [
        _ROUTES_ROOT / "auth_routes" / "__init__.py",
        _ROUTES_ROOT / "chat_routes" / "__init__.py",
        _ROUTES_ROOT / "questions_routes" / "__init__.py",
        _ROUTES_ROOT / "ai_routes" / "__init__.py",
        _ROUTES_ROOT / "admin_routes" / "__init__.py",
        _ROUTES_ROOT / "ai_gateway_routes" / "__init__.py",
        _ROUTES_ROOT / "file_center_routes" / "__init__.py",
        _ROUTES_ROOT / "video_routes" / "__init__.py",
    ]

    for path in package_inits:
        text = path.read_text(encoding="utf-8", errors="ignore")
        assert "from . import " not in text
        assert "include_router(" in text


def test_runtime_layers_do_not_import_settings_leaf_modules_directly():
    allowed_roots = {
        _BACKEND_ROOT / "core" / "config.py",
        _BACKEND_ROOT / "core" / "settings",
    }
    offenders: set[str] = set()

    for root in (
        _BACKEND_ROOT / "routes",
        _BACKEND_ROOT / "services",
        _BACKEND_ROOT / "apps",
        _BACKEND_ROOT / "presenton_host",
    ):
        for path in root.rglob("*.py"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "backend.core.settings" not in text:
                continue
            if any(str(path).startswith(str(allowed_root)) for allowed_root in allowed_roots):
                continue
            offenders.add(_relative_backend_path(path))

    assert offenders == set()


def test_presenton_runtime_mount_defers_runtime_router_wiring():
    path = _BACKEND_ROOT / "presenton_host" / "runtime_mount.py"
    text = path.read_text(encoding="utf-8", errors="ignore")

    assert "def ensure_presenton_router_wired" in text
    assert "load_presenton_runtime().API_V1_PPT_ROUTER" in text
    assert "app.include_router(ensure_presenton_router_wired())" in text
    assert "PRESENTON_HOST_ROUTER.include_router(\n    load_presenton_runtime().API_V1_PPT_ROUTER" not in text


def test_presenton_presentation_package_does_not_import_template_font_giants():
    forbidden = (
        "templates.pptx_font_utils",
        "templates.fonts_and_slides_preview",
    )
    offenders: dict[str, list[str]] = {}
    for path in _PRESENTATION_ENDPOINT_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        hits = [token for token in forbidden if token in text]
        if hits:
            offenders[_relative_backend_path(path)] = hits
    assert offenders == {}


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


def test_architecture_impl_files_are_explicitly_bounded():
    offenders: set[str] = set()
    for path in _ARCHITECTURE_FACADES_ROOT.glob("*_impl.py"):
        relative = _relative_backend_path(path)
        line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        if line_count > 200 and relative not in _ARCHITECTURE_IMPL_LONG_ALLOWLIST:
            offenders.add(relative)
    assert offenders == set()


def test_architecture_helper_modules_are_bounded():
    offenders: set[str] = set()
    for root in _ARCHITECTURE_HELPER_ROOTS:
        for path in root.rglob("*.py"):
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            if line_count > 350:
                offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_presenton_helper_modules_are_bounded():
    offenders: set[str] = set()
    for root in _PRESENTON_HELPER_ROOTS:
        for path in root.rglob("*.py"):
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            if line_count > 350:
                offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_service_helper_modules_are_bounded():
    offenders: set[str] = set()
    for root in _SERVICE_HELPER_ROOTS:
        for path in root.rglob("*.py"):
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            if line_count > 350:
                offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_presenton_endpoint_helper_modules_are_bounded():
    offenders: set[str] = set()
    for root in _PRESENTON_ENDPOINT_HELPER_ROOTS:
        for path in root.rglob("*.py"):
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            if line_count > 350:
                offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_presenton_template_helper_modules_are_bounded():
    offenders: set[str] = set()
    for root in _PRESENTON_TEMPLATE_HELPER_ROOTS:
        for path in root.rglob("*.py"):
            line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            if line_count > 350:
                offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_presenton_presentation_package_modules_are_bounded():
    offenders: set[str] = set()
    for path in _PRESENTATION_ENDPOINT_ROOT.rglob("*.py"):
        line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        if line_count > 350:
            offenders.add(_relative_backend_path(path))
    assert offenders == set()


def test_explicit_thin_entrypoints_stay_bounded():
    offenders: set[str] = set()
    for relative_path, threshold in _EXPLICIT_LINE_BOUNDS.items():
        path = _BACKEND_ROOT / Path(relative_path)
        line_count = len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        if line_count > threshold:
            offenders.add(f"{relative_path}:{line_count}>{threshold}")
    assert offenders == set()


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
