from __future__ import annotations

import os

from fastapi import HTTPException

from backend.services.slides.html_renderer import BrowserRendererUnavailableError


def serialize_theme_draft_slides(slides) -> list[dict]:
    return [slide.model_dump() if hasattr(slide, "model_dump") else slide.dict() for slide in slides]


async def generate_render_impl(
    req,
    user: dict,
    request,
    *,
    config,
    logger,
    theme_names: dict[str, str],
    resolve_provider_runtime,
    build_generate_render_source,
    build_generate_render_result_metadata,
    save_slides_history,
    task_tracker_cls,
    step_status,
):
    from backend.services.slides.dynamic_theme_service import DynamicThemeService
    from backend.services.slides.html_renderer import SlidesHtmlRenderer, ensure_browser_renderer

    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = task_tracker_cls(request_id=request_id, user_id=user.get("id", ""), task_type="generate_render")
    try:
        md_content = req.md_content.strip()
        if not md_content:
            raise HTTPException(status_code=400, detail="md_content must not be empty")
        if req.base_style not in theme_names:
            raise HTTPException(status_code=400, detail=f"Unknown base_style '{req.base_style}'. Supported: {list(theme_names.keys())}")

        theme_service = DynamicThemeService()
        base_css = theme_service.load_base_css(req.base_style)
        custom_css = base_css
        runtime = None
        if req.custom_style_prompt.strip():
            runtime = await resolve_provider_runtime(
                req.provider or "auto",
                feature="slides.generate_render",
                user=user,
                require_healthy=True,
            )
            with tracker.step("customize_theme", base_style=req.base_style):
                custom_css = await theme_service.customize_theme(
                    base_css_content=base_css,
                    user_custom_theme_prompt=req.custom_style_prompt,
                    provider=runtime.provider_id,
                    runtime=runtime,
                )

        renderer = SlidesHtmlRenderer()
        os.makedirs(config.PPT_RESULTS_FOLDER, exist_ok=True)
        with tracker.step("render", base_style=req.base_style):
            renderer_status = await ensure_browser_renderer(smoke_test=True)
            result = await renderer.render_and_export(
                md_content=md_content,
                css_content=custom_css,
                output_dir=config.PPT_RESULTS_FOLDER,
                title=req.title,
            )

        tracker.finish(step_status.SUCCESS)
        tracker.result_metadata["page_count"] = result["page_count"]
        tracker.result_metadata["base_style"] = req.base_style
        tracker.result_metadata["title"] = req.title
        tracker.result_metadata["pptx_download_url"] = result.get("pptx_download_url", "")
        tracker.result_metadata["html_preview_url"] = result.get("html_preview_url", "")
        await tracker.save()

        response_data = {
            "status": "success",
            "pptx_download_url": result["pptx_download_url"],
            "html_preview_url": result.get("html_preview_url", ""),
            "page_count": result["page_count"],
            "custom_css": custom_css,
            "draft_slides": result.get("draft_slides", []),
            "render_mode": result.get("render_mode"),
            "warning": result.get("warning"),
            "renderer": result.get("renderer", renderer_status),
            "error_code": result.get("error_code"),
            "details": result.get("details"),
            "request_id": tracker.request_id,
            "title": req.title,
            "provider_requested": getattr(runtime, "requested_provider", req.provider or "auto"),
            "provider_resolved": getattr(runtime, "provider_id", None),
            "provider_source": getattr(runtime, "config_source", None),
            "provider_model": getattr(runtime, "model", None),
        }
        try:
            await save_slides_history(
                user_id=user.get("id", ""),
                tool_name="generate_render",
                params={
                    "tool": "generate_render",
                    "base_style": req.base_style,
                    "provider": req.provider,
                    "has_custom_prompt": bool(req.custom_style_prompt.strip()),
                    "request_id": tracker.request_id,
                    "source_kind": req.source_kind or "text",
                },
                source={
                    **build_generate_render_source(req),
                    "result_artifacts": build_generate_render_result_metadata(req, result, tracker.request_id),
                },
                result_preview=f"Generated {result['page_count']} slides with '{theme_names.get(req.base_style, req.base_style)}' theme",
                result_full=result,
            )
        except Exception:
            logger.warning("history_insert_failed slide_generation", exc_info=True)
        return response_data
    except BrowserRendererUnavailableError as exc:
        tracker.finish(step_status.FAILED)
        logger.warning("[%s] Generate-render browser renderer unavailable: %s", tracker.request_id, exc.summary)
        raise HTTPException(status_code=503, detail=exc.to_payload())
    except HTTPException:
        tracker.finish(step_status.FAILED)
        raise
    except Exception as exc:
        tracker.finish(step_status.FAILED)
        logger.exception("[%s] Generate-render failed", tracker.request_id)
        raise HTTPException(status_code=500, detail=f"Slide generation failed: {str(exc)}")


async def export_render_draft_impl(req, *, output_dir: str):
    from backend.services.slides.html_renderer import ensure_browser_renderer, export_theme_draft

    if not req.slides:
        raise HTTPException(status_code=400, detail="slides must not be empty")
    if not req.css_content.strip():
        raise HTTPException(status_code=400, detail="css_content must not be empty")

    slides = serialize_theme_draft_slides(req.slides)
    renderer_status = await ensure_browser_renderer(smoke_test=True)
    result = await export_theme_draft(
        slides=slides,
        css_content=req.css_content,
        output_dir=output_dir,
        title=req.title,
    )
    return {
        "status": "success",
        "pptx_download_url": result["pptx_download_url"],
        "html_preview_url": result.get("html_preview_url", ""),
        "page_count": result["page_count"],
        "render_mode": result.get("render_mode"),
        "renderer": result.get("renderer", renderer_status),
        "error_code": result.get("error_code"),
        "details": result.get("details"),
        "title": req.title,
    }


async def render_draft_preview_impl(req):
    from backend.services.slides.html_renderer import build_theme_draft_preview, check_browser_renderer

    if not req.slides:
        raise HTTPException(status_code=400, detail="slides must not be empty")
    if not req.css_content.strip():
        raise HTTPException(status_code=400, detail="css_content must not be empty")

    slides = serialize_theme_draft_slides(req.slides)
    preview = build_theme_draft_preview(
        slides=slides,
        css_content=req.css_content,
        title=req.title,
        selected_slide_id=req.selected_slide_id,
        selected_index=req.selected_index,
    )
    renderer = await check_browser_renderer(smoke_test=True)
    return {
        "status": "success",
        "html": preview["html"],
        "page_count": preview["page_count"],
        "selected_index": preview["selected_index"],
        "selected_slide_id": preview["selected_slide_id"],
        "renderer": {
            "available": bool(renderer.get("available")),
            "mode": "browser" if renderer.get("available") else "unavailable",
            "message": renderer.get("message"),
        },
    }
