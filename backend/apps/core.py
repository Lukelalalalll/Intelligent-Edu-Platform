from __future__ import annotations

import os

from backend.config import Config
from backend.routes.auth_routes import auth_router, limiter
from backend.routes.admin_routes import admin_router
from backend.routes.ai_routes import ai_router
from backend.routes.mailbox_routes import mailbox_router as teacher_router
from backend.routes.grading_routes import grading_router
from backend.routes.ai_gateway_routes import ai_gateway_router
from backend.routes.chat_routes import chat_router
from backend.routes.homework_routes import router as homework_router
from backend.routes.file_center_routes import file_center_router

from .factory import create_app

DATA_ROOT = os.path.abspath(os.path.join(Config.BASE_DIR, os.pardir, "data"))
TEST_PDF_ROOT = os.path.join(Config.BASE_DIR, "test_pdf")
STATIC_ROOT = os.path.join(Config.BASE_DIR, "static")
ANNOTATED_PDF_ROOT = os.path.join(Config.BASE_DIR, "static", "grading_annotated")
UPLOADS_ROOT = os.path.join(Config.BASE_DIR, "uploads")

app = create_app(
    title="Intelligent Edu Platform Core API",
    versioned_routers=(
        auth_router,
        admin_router,
        ai_router,
        teacher_router,
        grading_router,
        ai_gateway_router,
        chat_router,
        file_center_router,
    ),
    direct_routers=(homework_router,),
    static_mounts=(
        ("/data", DATA_ROOT, "data"),
        ("/test_pdf", TEST_PDF_ROOT, "test_pdf"),
        ("/static", STATIC_ROOT, "static"),
        ("/grading_annotated", ANNOTATED_PDF_ROOT, "grading_annotated"),
        ("/uploads", UPLOADS_ROOT, "uploads"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=True,
    run_core_startup_jobs=False,
    reset_indexing_jobs_on_startup=True,
    enable_rag_preload=None,
    limiter=limiter,
)
