from __future__ import annotations

import os

from backend.config import Config
from backend.routes.slides_routes import slides_router, public_slides_router, legacy_sub1_router

from .factory import create_app

STATIC_ROOT = os.path.join(Config.BASE_DIR, "static")
UPLOADS_ROOT = os.path.join(Config.BASE_DIR, "uploads")
GENERATED_SUB1_ROOT = os.path.join(Config.BASE_DIR, "generated", "sub1")

app = create_app(
    title="Intelligent Edu Platform Slides Service",
    versioned_routers=(slides_router, legacy_sub1_router),
    direct_routers=(public_slides_router,),
    static_mounts=(
        ("/static", STATIC_ROOT, "static"),
        ("/uploads", UPLOADS_ROOT, "uploads"),
        ("/generated/sub1", GENERATED_SUB1_ROOT, "generated_sub1"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    enable_rag_preload=False,
)

