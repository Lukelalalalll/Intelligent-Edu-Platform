from __future__ import annotations

import traceback

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response

from .editor_support import (
    build_pptx_bytes_from_schema,
    editor_asset_dir,
    extract_json_from_markdown,
    frontend_session_payload,
    get_session_or_404,
    prep_auto_markdown,
    resolve_editor_asset,
    theme_from_body,
)


async def render_editor_session_impl(body, *, editor_session_cls, create_ppt_fn, config, logger):
    try:
        import base64 as _b64

        theme_id = theme_from_body(body)
        if body.ppt_schema is not None:
            pptx_bytes = build_pptx_bytes_from_schema(body.ppt_schema, theme_id, create_ppt_fn=create_ppt_fn, config=config)
        elif body.pptx_base64:
            try:
                pptx_bytes = _b64.b64decode(body.pptx_base64)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 PPTX data")
        else:
            raise HTTPException(status_code=400, detail="ppt_schema or pptx_base64 is required")

        try:
            _ = editor_session_cls._load_template_bytes(theme_id)
        except FileNotFoundError:
            logger.warning("Template not found for theme '%s'; session will use fallback rendering", theme_id)

        session = editor_session_cls.create_session(
            pptx_bytes=pptx_bytes,
            theme_id=theme_id,
            slide_lookup_table=body.slide_lookup_table,
        )
        if body.ppt_schema is not None:
            return frontend_session_payload(session)
        return session.get_pptx_payload()
    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.error("Editor session creation failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.error("Unexpected error in render_editor_session: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error while creating editor session")


def get_slide_png_impl(session_id: str, slide_index: int, *, editor_session_cls):
    session = get_session_or_404(session_id, editor_session_cls=editor_session_cls)
    png = session.get_slide_png(slide_index)
    if png is None:
        raise HTTPException(status_code=404, detail="Slide PNG not available")
    return Response(content=png, media_type="image/png")


def get_session_slide_png_impl(session_id: str, slide_index: int, *, editor_session_cls):
    session = get_session_or_404(session_id, editor_session_cls=editor_session_cls)
    if slide_index < 1:
        raise HTTPException(status_code=400, detail="slide_index must be 1-based")
    png = session.get_slide_png(slide_index)
    if png is None:
        raise HTTPException(status_code=404, detail="Slide PNG not available")
    return Response(content=png, media_type="image/png")


def export_pptx_impl(session_id: str, *, editor_session_cls, logger):
    session = get_session_or_404(session_id, editor_session_cls=editor_session_cls)
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


def get_editor_session_impl(session_id: str, *, editor_session_cls):
    return frontend_session_payload(get_session_or_404(session_id, editor_session_cls=editor_session_cls))


def session_health_impl(session_id: str, *, editor_session_cls):
    session = get_session_or_404(session_id, editor_session_cls=editor_session_cls)
    soffice_available = editor_session_cls._find_soffice() is not None
    return {
        "session_id": session.session_id,
        "exists": True,
        "total_slides": session.slide_count or len(session._slide_pngs),
        "slides_rendered": len(session._slide_pngs),
        "render_mode": "libreoffice" if soffice_available else "fallback",
        "libreoffice_available": soffice_available,
    }


async def auto_assign_layouts_impl(body, *, logger):
    if body.ppt_schema is not None:
        return {"ppt_schema": body.ppt_schema}

    try:
        import json
        from pathlib import Path

        from backend.services.ai_gateway_service import get_default_service

        combined_md = prep_auto_markdown(body.slides_md or [])
        if not combined_md.strip():
            raise HTTPException(status_code=400, detail="No slide content provided")

        prompt_template_path = Path(__file__).resolve().parents[2] / "prompts" / "layout_assignment.yaml"
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
                    detail="AI 布局分配服务暂时不可用（Ollama / AI 服务未连接）。请检查 AI 服务是否运行，或跳过自动分配使用手动布局。",
                )
            raise

        raw = extract_json_from_markdown(result["choices"][0]["message"]["content"])
        return {"layout_assignments": json.loads(raw)}
    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse AI layout response: %s", exc)
        raise HTTPException(status_code=502, detail="AI returned invalid JSON for layout assignments")
    except Exception as exc:
        logger.error("Auto layout assignment failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Auto-assign layouts failed: {str(exc)}")


def convert_to_pptx_impl(body, *, editor_session_cls, logger):
    try:
        import base64 as _b64

        pptx_bytes = editor_session_cls._build_pptx_from_json(body.payload, body.theme_id)
        return {
            "pptx_base64": _b64.b64encode(pptx_bytes).decode("ascii"),
            "size_bytes": len(pptx_bytes),
        }
    except Exception as exc:
        logger.error("Convert to PPTX failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to convert to PPTX: {str(exc)}")


def edit_text_impl(body, *, editor_session_cls, logger):
    session = get_session_or_404(body.session_id, editor_session_cls=editor_session_cls)
    try:
        session.commit_text_edit(body.slide_index, body.element_index, body.new_text)
        return {"status": "ok", "message": "Text edit committed"}
    except Exception as exc:
        logger.error("Text edit failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Text edit failed: {str(exc)}")


def re_render_session_impl(body, *, editor_session_cls):
    session = get_session_or_404(body.session_id, editor_session_cls=editor_session_cls)
    session._edits["frontend_edits"] = body.edits or []
    session._edits["slide_images"] = body.slide_images or []
    return frontend_session_payload(session)


async def upload_image_impl(file, *, config):
    from pathlib import Path
    import uuid

    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}:
        ext = ".png"
    asset_id = f"{uuid.uuid4().hex}{ext}"
    path = editor_asset_dir(config=config) / asset_id
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    path.write_bytes(data)
    return {"asset_id": asset_id, "url": f"/api/slides/editor/assets/{asset_id}"}


def get_uploaded_image_impl(asset_id: str, *, config):
    return FileResponse(resolve_editor_asset(asset_id, config=config))


def preview_zoom_impl(session_id: str, zoom: float, offset_x: int, offset_y: int, tile_size: int, *, editor_session_cls):
    session = get_session_or_404(session_id, editor_session_cls=editor_session_cls)
    png_bytes = session.render_zoomable_preview(
        zoom=zoom,
        offset_x=offset_x,
        offset_y=offset_y,
        tile_size=tile_size,
    )
    if png_bytes is None:
        raise HTTPException(status_code=404, detail="Preview image not available")
    return Response(content=png_bytes, media_type="image/png")
