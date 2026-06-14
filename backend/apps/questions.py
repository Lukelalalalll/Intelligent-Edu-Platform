from __future__ import annotations

import os

from backend.config import Config
from backend.routes.questions_routes import questions_router

from .factory import create_app

UPLOADS_SUB2_ROOT = os.path.join(Config.BASE_DIR, "uploads", "sub2")
GENERATED_SUB2_ROOT = os.path.join(Config.BASE_DIR, "generated", "sub2")
SCREENSHOTS_SUB2_ROOT = os.path.join(Config.BASE_DIR, "static", "sub2", "screenshots")

app = create_app(
    title="Intelligent Edu Platform Question Service",
    versioned_routers=(questions_router,),
    static_mounts=(
        ("/uploads/sub2", UPLOADS_SUB2_ROOT, "uploads_sub2"),
        ("/generated/sub2", GENERATED_SUB2_ROOT, "generated_sub2"),
        ("/static/sub2/screenshots", SCREENSHOTS_SUB2_ROOT, "screenshots_sub2"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    cleanup_question_files_on_startup=True,
    enable_rag_preload=False,
)
