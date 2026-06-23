from __future__ import annotations

from fastapi import APIRouter

from backend.routes.slides_routes.pipeline import (
    classify_highlights,
    download_combined,
    load_highlights,
    save_highlights,
)


def build_highlighter_router() -> APIRouter:
    router = APIRouter(prefix="/slides", tags=["Document Highlighter"])
    router.add_api_route("/download/{filename}", download_combined, methods=["GET"])
    router.add_api_route("/load_highlights/{filename}", load_highlights, methods=["GET"])
    router.add_api_route("/save_highlights", save_highlights, methods=["POST"])
    router.add_api_route("/classify-highlights", classify_highlights, methods=["POST"])
    return router
