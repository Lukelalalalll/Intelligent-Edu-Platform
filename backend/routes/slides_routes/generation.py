from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request

from backend.config import Config
from backend.core.ai_provider import resolve_provider, resolve_provider_runtime
from backend.core.database import compute_history_expires_at
from backend.core.security import get_current_user
from backend.schemas import (
    ExportRenderDraftRequest,
    GenerateRenderRequest,
    GenerateScriptSchema,
    PptProcessSchema,
    RenderDraftPreviewRequest,
    SummarizeChaptersSchema,
    SummarizeRequestSchema,
)
from backend.services.history_service import save_history_record
from backend.services.slides.infra.task_tracker import StepStatus, TaskTracker
from backend.services.slides.pipeline_service import create_ppt as _create_ppt_impl
from backend.services.slides.pipeline_service import generate_outline as _svc_generate_outline
from backend.services.slides.pipeline_service import generate_script as _svc_generate_script
from backend.services.slides.pipeline_service import process_text_to_md as _svc_process_text

from .generation_history import build_generate_render_result_metadata, build_generate_render_source
from .generation_processing import coze_generate_outline_impl, process_ppt_impl, process_text_impl
from .generation_rendering import (
    export_render_draft_impl,
    generate_render_impl,
    render_draft_preview_impl,
    serialize_theme_draft_slides,
)
from .generation_summary import THEMES_PAYLOAD, generate_talking_script_impl, summarize_chapters_impl, summarize_highlights_impl
from .shared import CozeOutlineRequest, ProcessTextRequest, THEME_NAMES

router = APIRouter()
logger = logging.getLogger(__name__)

_build_generate_render_source = build_generate_render_source
_build_generate_render_result_metadata = build_generate_render_result_metadata
_serialize_theme_draft_slides = serialize_theme_draft_slides


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


@router.post("/process-ppt")
@router.post("/generate_ppt")
async def process_ppt(req: PptProcessSchema, request: Request):
    from backend.services.slides.infra.checkpoint_manager import CheckpointManager

    return await process_ppt_impl(
        req,
        request,
        task_tracker_cls=TaskTracker,
        step_status=StepStatus,
        checkpoint_manager_cls=CheckpointManager,
        create_ppt_impl=_create_ppt_impl,
        logger=logger,
    )


@router.post("/coze-generate-outline")
async def coze_generate_outline(req: CozeOutlineRequest, user: dict = Depends(get_current_user)):
    return await coze_generate_outline_impl(
        req,
        user,
        resolve_provider=resolve_provider,
        generate_outline=_svc_generate_outline,
        save_slides_history=_save_slides_history,
        logger=logger,
    )


@router.post("/process-text")
async def process_text(req: ProcessTextRequest, user: dict = Depends(get_current_user)):
    return await process_text_impl(
        req,
        user,
        process_text_to_md=_svc_process_text,
        save_slides_history=_save_slides_history,
        logger=logger,
    )


@router.post("/summarize")
async def summarize_highlights(
    req: SummarizeRequestSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    return await summarize_highlights_impl(
        req,
        user,
        request,
        task_tracker_cls=TaskTracker,
        step_status=StepStatus,
        save_slides_history=_save_slides_history,
        logger=logger,
    )


@router.post("/summarize_in_chapters")
async def summarize_chapters(
    req: SummarizeChaptersSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    return await summarize_chapters_impl(
        req,
        user,
        request,
        task_tracker_cls=TaskTracker,
        step_status=StepStatus,
        logger=logger,
    )


@router.post("/generate_talking_script")
async def generate_talking_script(
    req: GenerateScriptSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    return await generate_talking_script_impl(
        req,
        user,
        request,
        task_tracker_cls=TaskTracker,
        step_status=StepStatus,
        resolve_provider=resolve_provider,
        generate_script=_svc_generate_script,
        logger=logger,
    )


@router.get("/themes")
async def list_themes():
    return THEMES_PAYLOAD


@router.post("/generate-render")
async def generate_render(
    req: GenerateRenderRequest,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    return await generate_render_impl(
        req,
        user,
        request,
        config=Config,
        logger=logger,
        theme_names=THEME_NAMES,
        resolve_provider_runtime=resolve_provider_runtime,
        build_generate_render_source=_build_generate_render_source,
        build_generate_render_result_metadata=_build_generate_render_result_metadata,
        save_slides_history=_save_slides_history,
        task_tracker_cls=TaskTracker,
        step_status=StepStatus,
    )


@router.post("/export-render-draft")
async def export_render_draft(
    req: ExportRenderDraftRequest,
    user: dict = Depends(get_current_user),
):
    return await export_render_draft_impl(req, output_dir=Config.PPT_RESULTS_FOLDER)


@router.post("/render-draft-preview")
async def render_draft_preview(
    req: RenderDraftPreviewRequest,
    user: dict = Depends(get_current_user),
):
    return await render_draft_preview_impl(req)
