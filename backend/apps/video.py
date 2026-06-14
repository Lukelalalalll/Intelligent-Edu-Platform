from __future__ import annotations

import os

from backend.config import Config
from backend.routes.video_routes import router as video_router

from .factory import create_app

UPLOADS_ROOT = os.path.join(Config.BASE_DIR, "uploads")
GENERATED_VIDEOS_ROOT = os.path.join(Config.BASE_DIR, "generated", "videos")

app = create_app(
    title="Intelligent Edu Platform Video Service",
    versioned_routers=(video_router,),
    static_mounts=(
        ("/uploads", UPLOADS_ROOT, "uploads"),
        ("/generated/videos", GENERATED_VIDEOS_ROOT, "generated_videos"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    enable_rag_preload=False,
)

