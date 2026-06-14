from __future__ import annotations

import asyncio
import logging
import os

from fastapi import Depends, HTTPException, Request

from backend.config import Config
from backend.core.ai_provider import resolve_provider
from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas import (
    GenerateRenderRequest,
    GenerateScriptSchema,
    PptProcessSchema,
    SummarizeChaptersSchema,
    SummarizeRequestSchema,
)
from backend.services.history_service import save_history_record
from backend.services.slides import StepStatus, TaskTracker
from backend.services.slides_pipeline_service import create_ppt as _create_ppt_impl
from backend.services.slides_pipeline_service import generate_outline as _svc_generate_outline
from backend.services.slides_pipeline_service import generate_script as _svc_generate_script
from backend.services.slides_pipeline_service import process_text_to_md as _svc_process_text

from .router import slides_router
from .shared import CozeOutlineRequest, ProcessTextRequest, THEME_NAMES

logger = logging.getLogger(__name__)


async def _save_slides_history(
    *,
    user_id: str,
    tool_name: str,
    params: dict,
    result_preview: str,
    result_full,
    source: dict | None = None,
) -> None:
    await save_history_record(
        tool="slides",
        user_id=user_id,
        tool_name=tool_name,
        params=params,
        result_preview=result_preview,
        result_full=result_full,
        source=source,
        expires_at=await compute_history_expires_at(user_id),
    )


@slides_router.post("/process-ppt")
@slides_router.post("/generate_ppt")
async def process_ppt(req: PptProcessSchema, request: Request):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager

    request_id = request.headers.get("X-Request-ID") or None
    tracker = TaskTracker(request_id=request_id, task_type="ppt_generate")
    try:
        if not req.ppt_schema:
            raise ValueError("ppt_schema is required")

        slides_count = len(req.ppt_schema.get("slides", []) if isinstance(req.ppt_schema, dict) else [])
        with tracker.step("ppt_generate", slides_count=slides_count):
            filename = await asyncio.to_thread(_create_ppt_impl, req.ppt_schema)

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["filename"] = filename
        await CheckpointManager.save(
            task_id=tracker.request_id,
            step="ppt_generate",
            output={"filename": filename, "download_url": f"/api/sub1/download_ppt/{filename}"},
            input_data=req.ppt_schema if isinstance(req.ppt_schema, dict) else None,
        )
        await tracker.save()
        return {
            "status": "success",
            "filename": filename,
            "download_url": f"/api/slides/download_ppt/{filename}",
            "request_id": tracker.request_id,
        }
    except ValueError as exc:
        tracker.finish(StepStatus.FAILED)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] PPT generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/coze-generate-outline")
async def coze_generate_outline(req: CozeOutlineRequest, user: dict = Depends(get_current_user)):
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(400, "Keywords must not be empty")

    resolved_provider = resolve_provider(req.provider, feature="slides.generate_outline", user=user)
    text = await _svc_generate_outline(keywords, provider=resolved_provider)
    try:
        await _save_slides_history(
            user_id=user.get("id", ""),
            tool_name="coze_generate_outline",
            params={
                "tool": "coze_generate_outline",
                "source_type": "text",
                "keywords": keywords[:200],
                "provider": resolved_provider,
            },
            source={"keywords": keywords},
            result_preview=(text or "")[:500],
            result_full=text or "",
        )
    except Exception:
        logger.warning("history_insert_failed tool=coze_generate_outline", exc_info=True)
    return {"text": text}


@slides_router.post("/process-text")
async def process_text(req: ProcessTextRequest, user: dict = Depends(get_current_user)):
    text = req.text.strip()
    title = req.title.strip() or "untitled"
    if not text:
        raise HTTPException(400, "Text must not be empty")

    try:
        filename, sections_count = _svc_process_text(text, title)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    logger.info("process-text: wrote %d sections to %s", sections_count, filename)
    try:
        await _save_slides_history(
            user_id=user.get("id", ""),
            tool_name="process_text",
            params={
                "tool": "process_text",
                "source_type": "text",
                "title": title,
                "sections_count": sections_count,
            },
            source={"title": title},
            result_preview=text[:500],
            result_full=text,
        )
    except Exception:
        logger.warning("history_insert_failed tool=process_text", exc_info=True)
    return {"filename": filename, "sections": sections_count}


@slides_router.post("/summarize")
async def summarize_highlights(
    req: SummarizeRequestSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize")
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager, _compute_hash

    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer

        structured_content = []
        for section in req.highlights:
            section_text = "\n".join(item.get("text", "") for item in section.get("highlights", []))
            if section_text:
                structured_content.append({"title": section.get("sectionTitle", "Untitled"), "content": section_text})

        if not structured_content:
            raise HTTPException(status_code=400, detail="No valid highlights provided for summarization.")

        input_for_hash = {
            "content": structured_content,
            "num_of_bullets": req.num_of_bullets,
            "words_each_bullet": req.words_each_bullet,
        }
        input_hash = _compute_hash(input_for_hash)
        cached = await CheckpointManager.load_by_hash(step="summarize", input_hash=input_hash)
        if cached:
            tracker.mark_skipped("summarize")
            tracker.finish(StepStatus.SUCCESS)
            tracker.result_metadata["cache_hit"] = True
            await tracker.save()
            return {"status": "success", "results": cached["output"], "request_id": tracker.request_id, "cached": True}

        summarizer = SectionSummarizer()
        with tracker.step(
            "summarize",
            sections_count=len(structured_content),
            num_of_bullets=req.num_of_bullets,
            words_each_bullet=req.words_each_bullet,
        ):
            results = await summarizer.summarize_sections(
                highlights_data=structured_content,
                num_of_bullets=req.num_of_bullets,
                words_each_bullet=req.words_each_bullet,
            )

        failed = [item for item in results if item.get("_status") == "failed"]
        if failed and len(failed) < len(results):
            overall_status = "partial_success"
        elif failed:
            overall_status = "failed"
        else:
            overall_status = "success"

        tracker.finish(StepStatus.SUCCESS if overall_status != "failed" else StepStatus.FAILED)
        tracker.result_metadata["slides_generated"] = len(results)
        tracker.result_metadata["slides_failed"] = len(failed)
        await CheckpointManager.save(
            task_id=tracker.request_id,
            step="summarize",
            output=results,
            input_data=input_for_hash,
            user_id=user.get("username", ""),
        )
        await tracker.save()

        response = {"status": overall_status, "results": results, "request_id": tracker.request_id}
        if failed:
            response["failed_sections"] = [
                {"slide_number": item["slide_number"], "error": item.get("_error", "unknown")}
                for item in failed
            ]

        try:
            await _save_slides_history(
                user_id=user.get("id", ""),
                tool_name="summarize_highlights",
                params={
                    "tool": "summarize_highlights",
                    "source_type": "highlights",
                    "sections_count": len(structured_content),
                    "slides_generated": len(results),
                    "num_of_bullets": req.num_of_bullets,
                    "words_each_bullet": req.words_each_bullet,
                },
                source={"sections_count": len(structured_content)},
                result_preview=f"Generated {len(results)} slides from {len(structured_content)} sections",
                result_full=results,
            )
        except Exception:
            logger.warning("history_insert_failed slide_generation", exc_info=True)
        return response
    except HTTPException:
        tracker.finish(StepStatus.FAILED)
        raise
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Summarize failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/summarize_in_chapters")
async def summarize_chapters(
    req: SummarizeChaptersSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="summarize_chapters")
    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer

        summarizer = SectionSummarizer()
        with tracker.step("summarize", chapters_count=len(req.chapterData), total_pages=req.total_pages):
            results = await summarizer.summarize_sections(req.chapterData, req.num_of_bullets, req.words_each_bullet)
        tracker.finish(StepStatus.SUCCESS)
        await tracker.save()
        return {"status": "success", "results": results[:req.total_pages], "request_id": tracker.request_id}
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Chapter summarization failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.post("/generate_talking_script")
async def generate_talking_script(
    req: GenerateScriptSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="script_generate")
    try:
        resolved_provider = resolve_provider(req.provider, feature="slides.generate_script", user=user)
        with tracker.step("script_generate", slides_count=len(req.slides_results), style=req.script_style):
            scripts, filename = await _svc_generate_script(
                slides_results=req.slides_results,
                style=req.script_style,
                title=req.presentation_title,
                provider=resolved_provider,
            )

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["total_scripts"] = len(scripts)
        await tracker.save()
        response_data = {
            "status": "success",
            "total_scripts": len(scripts),
            "estimated_total_duration": f"{len(scripts) * 2} minutes",
            "request_id": tracker.request_id,
        }
        if req.generate_word:
            response_data["word_document"] = {
                "available": True,
                "filename": filename,
                "download_url": f"/api/slides/download_script/{filename}",
            }
        return response_data
    except Exception:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Script generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


@slides_router.get("/themes")
async def list_themes():
    return {
        "themes": [
            {
                "id": "minimalist",
                "name": THEME_NAMES["minimalist"],
                "description": "Clean, academic style with serif fonts and warm accent colors.",
                "preview_colors": ["#ffffff", "#333333", "#2d6a4f"],
            },
            {
                "id": "neon_tech",
                "name": THEME_NAMES["neon_tech"],
                "description": "Dark tech aesthetic with neon glow effects and monospace fonts.",
                "preview_colors": ["#0a0a1a", "#00ff88", "#ff00aa"],
            },
            {
                "id": "corporate",
                "name": THEME_NAMES["corporate"],
                "description": "Professional blue-gray palette, modern sans-serif layout.",
                "preview_colors": ["#f8f9fa", "#1a365d", "#2b6cb0"],
            },
        ]
    }


@slides_router.post("/generate-render")
async def generate_render(
    req: GenerateRenderRequest,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    from backend.services.slides.dynamic_theme_service import DynamicThemeService
    from backend.services.slides.html_renderer import SlidesHtmlRenderer

    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = TaskTracker(request_id=request_id, user_id=user.get("username", ""), task_type="generate_render")

    try:
        md_content = req.md_content.strip()
        if not md_content:
            raise HTTPException(status_code=400, detail="md_content must not be empty")

        base_style = req.base_style
        if base_style not in THEME_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown base_style '{base_style}'. Supported: {list(THEME_NAMES.keys())}",
            )

        theme_service = DynamicThemeService()
        base_css = theme_service.load_base_css(base_style)
        custom_css = base_css
        if req.custom_style_prompt.strip():
            logger.info("[%s] Customizing theme with prompt: %s", tracker.request_id, req.custom_style_prompt[:100])
            with tracker.step("customize_theme", base_style=base_style):
                custom_css = await theme_service.customize_theme(
                    base_css_content=base_css,
                    user_custom_theme_prompt=req.custom_style_prompt,
                    provider=req.provider or "local_ollama",
                )
        else:
            logger.info("[%s] Using base theme '%s' without customization", tracker.request_id, base_style)

        renderer = SlidesHtmlRenderer()
        output_dir = Config.PPT_RESULTS_FOLDER
        os.makedirs(output_dir, exist_ok=True)
        with tracker.step("render", base_style=base_style):
            result = await renderer.render_and_export(
                md_content=md_content,
                css_content=custom_css,
                output_dir=output_dir,
                title=req.title,
            )

        tracker.finish(StepStatus.SUCCESS)
        tracker.result_metadata["page_count"] = result["page_count"]
        tracker.result_metadata["base_style"] = base_style
        await tracker.save()

        response_data = {
            "status": "success",
            "pptx_download_url": result["pptx_download_url"],
            "html_preview_url": result.get("html_preview_url", ""),
            "page_count": result["page_count"],
            "custom_css": custom_css,
            "request_id": tracker.request_id,
        }
        try:
            await _save_slides_history(
                user_id=user.get("id", ""),
                tool_name="generate_render",
                params={
                    "tool": "generate_render",
                    "base_style": base_style,
                    "provider": req.provider,
                    "has_custom_prompt": bool(req.custom_style_prompt.strip()),
                },
                source={"title": req.title},
                result_preview=f"Generated {result['page_count']} slides with '{THEME_NAMES.get(base_style, base_style)}' theme",
                result_full=result,
            )
        except Exception:
            logger.warning("history_insert_failed slide_generation", exc_info=True)
        return response_data
    except HTTPException:
        tracker.finish(StepStatus.FAILED)
        raise
    except Exception as exc:
        tracker.finish(StepStatus.FAILED)
        logger.exception("[%s] Generate-render failed", tracker.request_id)
        raise HTTPException(status_code=500, detail=f"Slide generation failed: {str(exc)}")
