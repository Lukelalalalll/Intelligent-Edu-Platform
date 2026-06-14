from __future__ import annotations

import os

from backend.config import Config
from backend.routes.study_notes_routes import study_notes_router

from .factory import create_app

UPLOADS_SUB5_ROOT = os.path.join(Config.BASE_DIR, "uploads", "sub5")
GENERATED_SUB5_ROOT = os.path.join(Config.BASE_DIR, "generated", "sub5")

app = create_app(
    title="Intelligent Edu Platform Study Notes Service",
    versioned_routers=(study_notes_router,),
    static_mounts=(
        ("/uploads/sub5", UPLOADS_SUB5_ROOT, "uploads_sub5"),
        ("/generated/sub5", GENERATED_SUB5_ROOT, "generated_sub5"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    enable_rag_preload=False,
)
