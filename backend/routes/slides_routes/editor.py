"""
Slides Editor Routes – Session management, preview rendering, and PPTX export.

Provides endpoints for:
- POST   /api/slides/editor/render-editor-session   – create session & render PNGs
- GET    /api/slides/editor/get-slide-png            – fetch a single slide PNG
- GET    /api/slides/editor/export-pptx              – download the PPTX file
- GET    /api/slides/editor/get-editor-session       – retrieve session metadata
- GET    /api/slides/editor/session-health           – lightweight session health check
- POST   /api/slides/editor/auto-assign-layouts      – AI-powered layout assignment
- POST   /api/slides/editor/convert-to-pptx          – convert JSON payload to PPTX
- POST   /api/slides/editor/edit-text                – in-place text editing
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import tempfile
import traceback
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from backend.core.config import Config
from backend.core.security import get_current_user
from backend.services.slides.output.editor_session import EditorSession
from backend.services.slides_pipeline_service import create_ppt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/editor", tags=["slides-editor"])


def _extract_json_from_markdown(text: str) -> str:
    """Extract JSON content from a markdown code fence, handling various formats."""
    match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class RenderEditorSessionRequest(BaseModel):
    """Request to create a new editor session with PPTX rendering."""
    pptx_base64: Optional[str] = Field(None, description="Base64-encoded PPTX bytes")
    theme_id: Optional[str] = Field(None, description="Theme identifier for template merging")
    theme: Optional[str] = Field(None, description="Frontend theme identifier")
    ppt_schema: Optional[Dict[str, Any]] = Field(None, description="Frontend PPT schema")
    slide_lookup_table: Dict[int, str] = Field(
        default_factory=dict,
        description="Mapping from slide index to layout type (e.g. 'title_slide')",
    )


class AutoAssignLayoutsRequest(BaseModel):
    """Request body for AI-powered layout assignment."""
    slides_md: Optional[List[Dict[str, Any]]] = Field(
        None, description="Array of slide objects with md_content and slide_number"
    )
    provider: Optional[str] = None
    theme: Optional[str] = None
    ppt_schema: Optional[Dict[str, Any]] = None


class ConvertToPptxRequest(BaseModel):
    """Request body to convert a JSON structure into a PPTX."""
    payload: Dict[str, Any] = Field(
        ..., description="JSON payload describing slides and their elements"
    )
    theme_id: str = Field(..., description="Theme ID to apply")


class EditTextRequest(BaseModel):
    """In-place text editing request."""
    session_id: str = Field(..., description="Editor session ID")
    slide_index: int = Field(..., ge=1, description="1-based slide index")
    element_index: int = Field(..., ge=0, description="0-based element index on the slide")
    new_text: str = Field(..., min_length=1, description="New text content")


class ReRenderSessionRequest(BaseModel):
    session_id: str = Field(..., description="Editor session ID")
    edits: List[Dict[str, Any]] = Field(default_factory=list)
    slide_images: Optional[List[Dict[str, Any]]] = None


class ExportPptxRequest(BaseModel):
    session_id: str = Field(..., description="Editor session ID")
    theme: Optional[str] = None
    ppt_schema: Optional[Dict[str, Any]] = None
    edits: List[Dict[str, Any]] = Field(default_factory=list)
    slide_images: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _prep_auto_markdown(slides_md: list) -> str:
    """
    Turn a list of slide objects (each with 'md_content' and 'slide_number')
    into a single Markdown string with numbered slide separators.
    """
    parts: list[str] = []
    for s in slides_md:
        num = s.get("slide_number", s.get("index", "?"))
        md = s.get("md_content", "")
        parts.append(f"--- Slide {num} ---\n{md}")
    return "\n\n".join(parts)


def _theme_from_body(body: RenderEditorSessionRequest) -> str:
    return (body.theme_id or body.theme or "Dark").strip() or "Dark"


def _build_pptx_bytes_from_schema(ppt_schema: Dict[str, Any], theme: str) -> bytes:
    schema = dict(ppt_schema or {})
    schema["theme"] = theme
    schema["slides"] = [
        {**slide, "layout": slide.get("layout") or {"name": "Title and Content"}}
        for slide in schema.get("slides", [])
        if isinstance(slide, dict)
    ]
    filename = create_ppt(schema)
    pptx_path = Path(Config.PPT_RESULTS_FOLDER) / filename
    if not pptx_path.is_file():
        raise RuntimeError(f"Generated PPTX not found: {pptx_path}")
    return pptx_path.read_bytes()


def _frontend_session_payload(session: EditorSession) -> Dict[str, Any]:
    slide_total = session.slide_count or len(session._slide_pngs)
    slides = [
        {
            "index": idx - 1,
            "preview_url": f"/api/slides/editor/sessions/{session.session_id}/slides/{idx}.png",
            "elements": [],
        }
        for idx in range(1, slide_total + 1)
    ]
    return {
        "session_id": session.session_id,
        "theme": session.theme_id,
        "theme_id": session.theme_id,
        "slide_width_pt": 960,
        "slide_height_pt": 540,
        "slides": slides,
        "total_slides": slide_total,
        "status": "ready",
    }


def _get_session_or_404(session_id: str) -> EditorSession:
    session = EditorSession.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session


def _editor_asset_dir() -> Path:
    path = Path(Config.PPT_RESULTS_FOLDER) / "editor_assets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_editor_asset(asset_id: str) -> Path:
    safe_name = os.path.basename(asset_id)
    if not safe_name or safe_name != asset_id:
        raise HTTPException(status_code=400, detail="Invalid asset id")
    path = _editor_asset_dir() / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return path


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/render-editor-session")
async def render_editor_session(
    body: RenderEditorSessionRequest,
    user: dict = Depends(get_current_user),
):
    """
    Create an editor session from a base64-encoded PPTX and render slide PNGs.

    Returns session metadata including base64-encoded PNG previews for each
    slide so the frontend can display them in an <img> tag.

    If LibreOffice is unavailable, falls back to simplified Pillow-based
    placeholder previews – the session is always created.
    """
    try:
        import base64 as _b64

        theme_id = _theme_from_body(body)
        if body.ppt_schema is not None:
            pptx_bytes = _build_pptx_bytes_from_schema(body.ppt_schema, theme_id)
        elif body.pptx_base64:
            try:
                pptx_bytes = _b64.b64decode(body.pptx_base64)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 PPTX data")
        else:
            raise HTTPException(status_code=400, detail="ppt_schema or pptx_base64 is required")

        # Template loading is optional – the PPTX is self-contained;
        # template merging only enhances visual fidelity when the theme exists.
        # create_session handles the missing-LibreOffice case with Pillow fallback.
        try:
            _ = EditorSession._load_template_bytes(theme_id)
        except FileNotFoundError:
            logger.warning(
                "Template not found for theme '%s'; session will use fallback rendering",
                theme_id,
            )

        # Create session (this also renders PNGs via LibreOffice or Pillow fallback)
        session = EditorSession.create_session(
            pptx_bytes=pptx_bytes,
            theme_id=theme_id,
            slide_lookup_table=body.slide_lookup_table,
        )

        if body.ppt_schema is not None:
            return _frontend_session_payload(session)
        return session.get_pptx_payload()

    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.error("Editor session creation failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.error("Unexpected error in render_editor_session: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error while creating editor session")


@router.get("/get-slide-png")
async def get_slide_png(
    session_id: str = Query(..., description="Editor session ID"),
    slide_index: int = Query(..., ge=1, description="1-based slide index"),
):
    """Return a single slide rendered as PNG (for on-demand loading)."""
    session = EditorSession.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    png = session.get_slide_png(slide_index)
    if png is None:
        raise HTTPException(status_code=404, detail="Slide PNG not available")

    return Response(content=png, media_type="image/png")


@router.get("/sessions/{session_id}/slides/{slide_index}.png")
async def get_session_slide_png(
    session_id: str,
    slide_index: int,
):
    """Return a slide PNG using a cache-bustable path instead of query params."""
    session = _get_session_or_404(session_id)
    if slide_index < 1:
        raise HTTPException(status_code=400, detail="slide_index must be 1-based")
    png = session.get_slide_png(slide_index)
    if png is None:
        raise HTTPException(status_code=404, detail="Slide PNG not available")
    return Response(content=png, media_type="image/png")


@router.get("/export-pptx")
async def export_pptx(
    session_id: str = Query(..., description="Editor session ID"),
):
    """
    Download the final PPTX file for the given editor session.
    Returns the PPTX bytes directly with proper Content-Disposition header
    so the browser downloads with the correct filename.
    """
    session = EditorSession.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    try:
        pptx_bytes = session.get_pptx_bytes()
        download_name = f"presentation_{session.session_id[:8]}.pptx"

        return Response(
            content=pptx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={
                "Content-Disposition": f'attachment; filename="{download_name}"',
                "Content-Length": str(len(pptx_bytes)),
            },
        )
    except Exception as exc:
        logger.error("PPTX export failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to export PPTX")


@router.post("/export-pptx")
async def export_pptx_post(
    body: ExportPptxRequest,
    user: dict = Depends(get_current_user),
):
    """Frontend-compatible PPTX export endpoint."""
    return await export_pptx(body.session_id)


@router.get("/get-editor-session")
async def get_editor_session(
    session_id: str = Query(..., description="Editor session ID"),
):
    """Retrieve session metadata (slide count, theme, status)."""
    session = _get_session_or_404(session_id)
    return _frontend_session_payload(session)


@router.get("/session-health")
async def session_health(
    session_id: str = Query(..., description="Editor session ID"),
):
    """
    Lightweight health check for an editor session.
    Returns whether the session exists, its render mode, and slide count.
    Useful for frontend polling after session creation.
    """
    session = EditorSession.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    soffice_available = EditorSession._find_soffice() is not None

    return {
        "session_id": session.session_id,
        "exists": True,
        "total_slides": session.slide_count or len(session._slide_pngs),
        "slides_rendered": len(session._slide_pngs),
        "render_mode": "libreoffice" if soffice_available else "fallback",
        "libreoffice_available": soffice_available,
    }


@router.post("/auto-assign-layouts")
async def auto_assign_layouts(
    body: AutoAssignLayoutsRequest,
    user: dict = Depends(get_current_user),
):
    """
    Use the AI gateway (DeepSeek / Ollama / OpenAI) to assign layout types
    to each slide based on its Markdown content.
    Returns a JSON array of {slide_number, layout_type}.

    If the primary AI service is unreachable (e.g. Ollama instance not on
    the same Tailscale network), returns a 503 with a clear error message
    so the frontend can fall back to manual layout assignment.
    """
    if body.ppt_schema is not None:
        return {"ppt_schema": body.ppt_schema}

    try:
        from backend.services.ai_gateway_service import get_default_service

        # Build combined Markdown
        combined_md = _prep_auto_markdown(body.slides_md or [])
        if not combined_md.strip():
            raise HTTPException(status_code=400, detail="No slide content provided")

        # Load prompt template
        import json
        from pathlib import Path
        prompt_template_path = (
            Path(__file__).resolve().parents[2] / "prompts" / "layout_assignment.yaml"
        )
        if prompt_template_path.is_file():
            import yaml
            system_text = yaml.safe_load(prompt_template_path.read_text(encoding="utf-8"))
            if isinstance(system_text, dict):
                system_text = system_text.get("system", "") or system_text.get("prompt", "")
        else:
            system_text = (
                "你是一个 PPT 排版专家。根据每个 slide 的 Markdown 内容，"
                "为其分配合适的 layout 类型。"
                "返回一个 JSON 数组，每个元素包含 slide_number 和 layout_type。"
            )

        # Call AI service with connection error detection
        service = get_default_service()
        try:
            result = await service.chat_completion(
                messages=[
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": combined_md},
                ],
                temperature=0.3,
                max_tokens=2000,
            )
        except Exception as ai_exc:
            error_msg = str(ai_exc).lower()
            if any(kw in error_msg for kw in ("connect", "timeout", "refused", "unreachable", "name or service not known")):
                logger.warning("AI service unreachable for layout assignment: %s", ai_exc)
                raise HTTPException(
                    status_code=503,
                    detail="AI 布局分配服务暂时不可用（Ollama / AI 服务未连接）。"
                           "请检查 AI 服务是否运行，或跳过自动分配使用手动布局。",
                )
            raise

        # Parse response into layout assignments
        raw = result["choices"][0]["message"]["content"]
        raw = _extract_json_from_markdown(raw)

        layout_assignments = json.loads(raw)
        return {"layout_assignments": layout_assignments}

    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse AI layout response: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI returned invalid JSON for layout assignments",
        )
    except Exception as exc:
        logger.error("Auto layout assignment failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Auto-assign layouts failed: {str(exc)}",
        )


@router.post("/convert-to-pptx")
async def convert_to_pptx(
    body: ConvertToPptxRequest,
    user: dict = Depends(get_current_user),
):
    """
    Convert a structured JSON payload into a PPTX file.
    Uses python-pptx for direct generation, bypassing LibreOffice.

    Returns a base64-encoded PPTX for use in render-editor-session.
    """
    try:
        import base64 as _b64

        pptx_bytes = EditorSession._build_pptx_from_json(body.payload, body.theme_id)
        return {
            "pptx_base64": _b64.b64encode(pptx_bytes).decode("ascii"),
            "size_bytes": len(pptx_bytes),
        }

    except Exception as exc:
        logger.error("Convert to PPTX failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to convert to PPTX: {str(exc)}")


@router.post("/edit-text")
async def edit_text(
    body: EditTextRequest,
    user: dict = Depends(get_current_user),
):
    """Commit a text edit to a slide element in the editor session."""
    session = EditorSession.get_session(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    try:
        session.commit_text_edit(body.slide_index, body.element_index, body.new_text)
        return {"status": "ok", "message": "Text edit committed"}
    except Exception as exc:
        logger.error("Text edit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Text edit failed: {str(exc)}")


@router.post("/re-render-session")
async def re_render_session(
    body: ReRenderSessionRequest,
    user: dict = Depends(get_current_user),
):
    """Frontend-compatible re-render endpoint."""
    session = _get_session_or_404(body.session_id)
    session._edits["frontend_edits"] = body.edits or []
    session._edits["slide_images"] = body.slide_images or []
    return _frontend_session_payload(session)


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}:
        ext = ".png"
    asset_id = f"{uuid.uuid4().hex}{ext}"
    path = _editor_asset_dir() / asset_id
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    path.write_bytes(data)
    return {
        "asset_id": asset_id,
        "url": f"/api/slides/editor/assets/{asset_id}",
    }


@router.get("/assets/{asset_id}")
async def get_uploaded_image(asset_id: str):
    path = _resolve_editor_asset(asset_id)
    return FileResponse(path)


# ---------------------------------------------------------------------------
# Zoomable preview endpoint
# ---------------------------------------------------------------------------

@router.get("/preview-zoom")
async def preview_zoom(
    session_id: str = Query(..., description="Editor session ID"),
    zoom: float = Query(1.0, ge=0.1, le=5.0, description="Zoom level"),
    offset_x: int = Query(0, ge=0, description="Horizontal scroll offset in pixels"),
    offset_y: int = Query(0, ge=0, description="Vertical scroll offset in pixels"),
    tile_size: int = Query(256, ge=64, le=1024, description="Tile size for viewport"),
):
    """Render a zoomable preview of all slides in a grid layout."""
    session = EditorSession.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    png_bytes = session.render_zoomable_preview(
        zoom=zoom,
        offset_x=offset_x,
        offset_y=offset_y,
        tile_size=tile_size,
    )
    if png_bytes is None:
        raise HTTPException(status_code=404, detail="Preview image not available")

    return Response(content=png_bytes, media_type="image/png")
