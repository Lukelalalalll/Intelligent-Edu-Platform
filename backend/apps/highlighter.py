from __future__ import annotations

import os

from fastapi import APIRouter

from backend.config import Config
from backend.routes.slides_routes.pipeline import (
    classify_highlights,
    download_combined,
    load_highlights,
    save_highlights,
)

from .factory import create_app

STATIC_ROOT = os.path.join(Config.BASE_DIR, "static")
UPLOADS_ROOT = os.path.join(Config.BASE_DIR, "uploads")
MD_SUB1_ROOT = os.path.join(Config.BASE_DIR, "md", "sub1")
HIGHLIGHTS_SUB1_ROOT = os.path.join(Config.BASE_DIR, "highlights", "sub1")

highlighter_router = APIRouter(prefix="/slides", tags=["Document Highlighter"])
highlighter_router.add_api_route("/download/{filename}", download_combined, methods=["GET"])
highlighter_router.add_api_route("/load_highlights/{filename}", load_highlights, methods=["GET"])
highlighter_router.add_api_route("/save_highlights", save_highlights, methods=["POST"])
highlighter_router.add_api_route("/classify-highlights", classify_highlights, methods=["POST"])

app = create_app(
    title="Intelligent Edu Platform Highlighter Service",
    versioned_routers=(highlighter_router,),
    static_mounts=(
        ("/static", STATIC_ROOT, "static"),
        ("/uploads", UPLOADS_ROOT, "uploads"),
        ("/md/sub1", MD_SUB1_ROOT, "md_sub1"),
        ("/highlights/sub1", HIGHLIGHTS_SUB1_ROOT, "highlights_sub1"),
    ),
    require_gateway_token=True,
    ensure_indexes_on_startup=False,
    run_core_startup_jobs=False,
    enable_rag_preload=False,
)
