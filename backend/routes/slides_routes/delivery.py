"""PPT Generator delivery facade and route exports."""

from __future__ import annotations

import logging

from backend.config import Config
from backend.core.ai_provider import check_runtime_health, resolve_provider_runtime
from backend.core.database import compute_history_expires_at
from backend.schemas import SlidesGenerateV2Schema
from backend.services.history_service import save_history_record
from backend.services.slides import ChapterSummarizer, PptGeneratorAdapterService, PptGeneratorTaskService, generate_talking_script_word
from backend.services.slides.svg_pipeline import build_svg_deck
from backend.services.slides.pipeline_service import create_ppt as create_ppt_from_schema

from .delivery_history import (
    attach_pptx_export,
    build_ppt_generator_history_params,
    build_ppt_generator_result_artifacts,
    build_ppt_generator_source,
    build_workflow_snapshot,
    persist_generate_v2_history,
)
from .delivery_outline import (
    build_ppt_generator_assistant_prompt,
    coerce_outline_points,
    extract_outline_title,
    extract_source_text_and_chapters,
    normalize_outline_slide,
    normalize_outline_slides,
    outline_to_markdown,
    strip_html,
)
from .delivery_runtime import resolve_ppt_generator_runtime_impl
from .delivery_task_runner import run_generate_v2_task_impl

logger = logging.getLogger(__name__)
SLIDES_GENERATE_V2_JOB_TYPE = "slides.generate_v2"

_attach_pptx_export = attach_pptx_export
_build_ppt_generator_source = build_ppt_generator_source
_build_ppt_generator_result_artifacts = build_ppt_generator_result_artifacts
_build_workflow_snapshot = build_workflow_snapshot
_build_ppt_generator_history_params = build_ppt_generator_history_params
_strip_html = strip_html
_extract_source_text_and_chapters = extract_source_text_and_chapters
_coerce_outline_points = coerce_outline_points
_outline_to_markdown = outline_to_markdown
_extract_outline_title = extract_outline_title
_normalize_outline_slide = normalize_outline_slide
_normalize_outline_slides = normalize_outline_slides
_build_ppt_generator_assistant_prompt = build_ppt_generator_assistant_prompt


async def _resolve_ppt_generator_runtime(
    requested: str | None,
    *,
    feature: str,
    user: dict | None,
    require_healthy: bool = False,
):
    return await resolve_ppt_generator_runtime_impl(
        requested,
        feature=feature,
        user=user,
        require_healthy=require_healthy,
        resolve_provider_runtime=resolve_provider_runtime,
        check_runtime_health=check_runtime_health,
    )


async def _save_ppt_generator_history(
    *,
    user_id: str,
    params: dict,
    result_preview: str,
    result_full: dict,
    source: dict,
) -> None:
    await save_history_record(
        tool="slides",
        user_id=user_id,
        tool_name="ppt_generator_generate_v2",
        params=params,
        result_preview=result_preview,
        result_full=result_full,
        source=source,
        expires_at=await compute_history_expires_at(user_id),
    )


async def _persist_generate_v2_history(
    *,
    user_id: str,
    task: dict | None,
    req: SlidesGenerateV2Schema,
    runtime,
    title: str,
    result: dict,
    slides_results: list[dict] | None = None,
    pptx_filename: str = "",
    design_spec_url: str = "",
    script_payload: dict | None = None,
) -> None:
    await persist_generate_v2_history(
        user_id=user_id,
        task=task,
        req=req,
        runtime=runtime,
        title=title,
        result=result,
        save_ppt_generator_history=_save_ppt_generator_history,
        slides_results=slides_results,
        pptx_filename=pptx_filename,
        design_spec_url=design_spec_url,
        script_payload=script_payload,
    )


async def _run_generate_v2_task(task_id: str, req: SlidesGenerateV2Schema, runtime, user: dict | None = None):
    await run_generate_v2_task_impl(
        task_id,
        req,
        runtime,
        user=user,
        config=Config,
        logger=logger,
        ppt_generator_adapter_service_cls=PptGeneratorAdapterService,
        ppt_generator_task_service=PptGeneratorTaskService,
        chapter_summarizer_cls=ChapterSummarizer,
        generate_talking_script_word_fn=generate_talking_script_word,
        create_ppt_from_schema_fn=create_ppt_from_schema,
        build_svg_deck_fn=build_svg_deck,
        attach_pptx_export_fn=_attach_pptx_export,
        persist_generate_v2_history_fn=_persist_generate_v2_history,
        extract_source_text_and_chapters_fn=_extract_source_text_and_chapters,
        normalize_outline_slides_fn=_normalize_outline_slides,
        outline_to_markdown_fn=_outline_to_markdown,
    )


from .delivery_routes import (  # noqa: E402
    _deck_dir,
    create_slides_delivery_job,
    generate_ppt_generator_outline,
    generate_v2,
    get_generate_v2_task,
    get_slides_delivery_artifact,
    get_slides_delivery_job,
    get_svg_deck,
    get_svg_deck_design_spec,
    get_svg_deck_slide,
    router,
    slides_provider_health,
    slides_providers,
    stream_generate_v2_task,
    stream_ppt_generator_assistant,
)

