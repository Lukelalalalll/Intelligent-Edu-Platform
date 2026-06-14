from __future__ import annotations

import os

from backend.config import Config
from backend.routes.diagram_routes import diagram_router
from backend.routes.image_extractor_routes import image_extractor_router

from .factory import create_app

UPLOADS_SUB3_ROOT = os.path.join(Config.BASE_DIR, "uploads", "sub3")
UPLOADS_SUB4_ROOT = os.path.join(Config.BASE_DIR, "uploads", "sub4")
GENERATED_SUB3_ROOT = os.path.join(Config.BASE_DIR, "generated", "sub3")
GENERATED_SUB4_ROOT = os.path.join(Config.BASE_DIR, "generated", "sub4")
STATIC_SUB4_ROOT = os.path.join(Config.BASE_DIR, "static", "sub4")

app = create_app(
    title="Intelligent Edu Platform Visual Service",
    versioned_routers=(diagram_router, image_extractor_router),
    static_mounts=(
        ("/uploads/sub3", UPLOADS_SUB3_ROOT, "uploads_sub3"),
        ("/uploads/sub4", UPLOADS_SUB4_ROOT, "uploads_sub4"),
        ("/generated/sub3", GENERATED_SUB3_ROOT, "generated_sub3"),
        ("/generated/sub4", GENERATED_SUB4_ROOT, "generated_sub4"),
        ("/static/sub4", STATIC_SUB4_ROOT, "static_sub4"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    enable_rag_preload=False,
)
