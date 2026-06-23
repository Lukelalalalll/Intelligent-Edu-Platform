"""
Slides Editor Routes 鈥?Session management, preview rendering, and PPTX export.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Query, UploadFile

from backend.core.config import Config
from backend.core.security import get_current_user
from backend.services.slides.output.editor_session import EditorSession
from backend.services.slides.pipeline_service import create_ppt

from .editor_impl import (
    auto_assign_layouts_impl,
    convert_to_pptx_impl,
    edit_text_impl,
    export_pptx_impl,
    get_editor_session_impl,
    get_session_slide_png_impl,
    get_slide_png_impl,
    get_uploaded_image_impl,
    preview_zoom_impl,
    re_render_session_impl,
    render_editor_session_impl,
    session_health_impl,
    upload_image_impl,
)
from .editor_models import (
    AutoAssignLayoutsRequest,
    ConvertToPptxRequest,
    EditTextRequest,
    ExportPptxRequest,
    ReRenderSessionRequest,
    RenderEditorSessionRequest,
)
from .editor_support import (
    build_pptx_bytes_from_schema as _build_pptx_bytes_from_schema,
    editor_asset_dir as _editor_asset_dir,
    extract_json_from_markdown as _extract_json_from_markdown,
    frontend_session_payload as _frontend_session_payload,
    get_session_or_404 as _get_session_or_404,
    prep_auto_markdown as _prep_auto_markdown,
    resolve_editor_asset as _resolve_editor_asset,
    theme_from_body as _theme_from_body,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/editor", tags=["slides-editor"])


@router.post("/render-editor-session")
async def render_editor_session(
    body: RenderEditorSessionRequest,
    user: dict = Depends(get_current_user),
):
    return await render_editor_session_impl(
        body,
        editor_session_cls=EditorSession,
        create_ppt_fn=create_ppt,
        config=Config,
        logger=logger,
    )


@router.get("/get-slide-png")
async def get_slide_png(
    session_id: str = Query(..., description="Editor session ID"),
    slide_index: int = Query(..., ge=1, description="1-based slide index"),
):
    return get_slide_png_impl(session_id, slide_index, editor_session_cls=EditorSession)


@router.get("/sessions/{session_id}/slides/{slide_index}.png")
async def get_session_slide_png(session_id: str, slide_index: int):
    return get_session_slide_png_impl(session_id, slide_index, editor_session_cls=EditorSession)


@router.get("/export-pptx")
async def export_pptx(session_id: str = Query(..., description="Editor session ID")):
    return export_pptx_impl(session_id, editor_session_cls=EditorSession, logger=logger)


@router.post("/export-pptx")
async def export_pptx_post(
    body: ExportPptxRequest,
    user: dict = Depends(get_current_user),
):
    return export_pptx_impl(body.session_id, editor_session_cls=EditorSession, logger=logger)


@router.get("/get-editor-session")
async def get_editor_session(session_id: str = Query(..., description="Editor session ID")):
    return get_editor_session_impl(session_id, editor_session_cls=EditorSession)


@router.get("/session-health")
async def session_health(session_id: str = Query(..., description="Editor session ID")):
    return session_health_impl(session_id, editor_session_cls=EditorSession)


@router.post("/auto-assign-layouts")
async def auto_assign_layouts(
    body: AutoAssignLayoutsRequest,
    user: dict = Depends(get_current_user),
):
    return await auto_assign_layouts_impl(body, logger=logger)


@router.post("/convert-to-pptx")
async def convert_to_pptx(
    body: ConvertToPptxRequest,
    user: dict = Depends(get_current_user),
):
    return convert_to_pptx_impl(body, editor_session_cls=EditorSession, logger=logger)


@router.post("/edit-text")
async def edit_text(
    body: EditTextRequest,
    user: dict = Depends(get_current_user),
):
    return edit_text_impl(body, editor_session_cls=EditorSession, logger=logger)


@router.post("/re-render-session")
async def re_render_session(
    body: ReRenderSessionRequest,
    user: dict = Depends(get_current_user),
):
    return re_render_session_impl(body, editor_session_cls=EditorSession)


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    return await upload_image_impl(file, config=Config)


@router.get("/assets/{asset_id}")
async def get_uploaded_image(asset_id: str):
    return get_uploaded_image_impl(asset_id, config=Config)


@router.get("/preview-zoom")
async def preview_zoom(
    session_id: str = Query(..., description="Editor session ID"),
    zoom: float = Query(1.0, ge=0.1, le=5.0, description="Zoom level"),
    offset_x: int = Query(0, ge=0, description="Horizontal scroll offset in pixels"),
    offset_y: int = Query(0, ge=0, description="Vertical scroll offset in pixels"),
    tile_size: int = Query(256, ge=64, le=1024, description="Tile size for viewport"),
):
    return preview_zoom_impl(
        session_id,
        zoom,
        offset_x,
        offset_y,
        tile_size,
        editor_session_cls=EditorSession,
    )
