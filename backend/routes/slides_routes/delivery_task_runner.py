from __future__ import annotations

import asyncio

from .delivery_task_support import (
    build_failed_result,
    build_ppt_schema,
    build_script_payload,
    build_success_result,
)
from .delivery_task_persistence import persist_failure_history, persist_success_history
from .delivery_task_generation import generate_outline_and_slides

async def run_generate_v2_task_impl(
    task_id: str,
    req,
    runtime,
    *,
    user: dict | None,
    config,
    logger,
    ppt_generator_adapter_service_cls,
    ppt_generator_task_service,
    chapter_summarizer_cls,
    generate_talking_script_word_fn,
    create_ppt_from_schema_fn,
    build_svg_deck_fn,
    attach_pptx_export_fn,
    persist_generate_v2_history_fn,
    extract_source_text_and_chapters_fn,
    normalize_outline_slides_fn,
    outline_to_markdown_fn,
) -> None:
    title = (req.presentation_title or "").strip() or "Generated Presentation"
    selected_theme = str(req.theme or "").strip()
    pptx_filename = ""
    deck_manifest = None
    script_payload = None
    slides_results = None

    try:
        resolved_provider = runtime.provider_id
        adapter = ppt_generator_adapter_service_cls(runtime=runtime)
        await ppt_generator_task_service.set_status(task_id, "running", progress=5)

        await ppt_generator_task_service.add_event(
            task_id,
            "step_start",
            "provider_health",
            f"Checking provider health ({resolved_provider}/{runtime.model})",
            progress=10,
        )
        healthy, message = await adapter.check_provider_health()
        if not healthy:
            raise RuntimeError(f"Provider health check failed: {message}")
        await ppt_generator_task_service.add_event(
            task_id,
            "step_done",
            "provider_health",
            "Provider is healthy",
            progress=18,
        )

        outline, slides_results = await generate_outline_and_slides(
            req=req,
            adapter=adapter,
            task_id=task_id,
            ppt_generator_task_service=ppt_generator_task_service,
            extract_source_text_and_chapters_fn=extract_source_text_and_chapters_fn,
            normalize_outline_slides_fn=normalize_outline_slides_fn,
        )
        ppt_schema = build_ppt_schema(
            title=title,
            selected_theme=selected_theme,
            resolved_provider=resolved_provider,
            runtime=runtime,
            slides_results=slides_results,
        )

        await ppt_generator_task_service.add_event(
            task_id,
            "step_start",
            "svg_deck",
            "Building SVG-first deck artifacts",
            progress=82,
        )
        deck_manifest = build_svg_deck_fn(
            task_id=task_id,
            title=title,
            slides=slides_results,
            runtime=runtime,
        )
        await ppt_generator_task_service.add_event(
            task_id,
            "step_done",
            "svg_deck",
            "SVG deck artifacts generated",
            progress=84,
        )

        await ppt_generator_task_service.add_event(
            task_id,
            "step_start",
            "pptx_export",
            "Finalizing PPTX export",
            progress=86,
        )
        pptx_filename = await asyncio.to_thread(create_ppt_from_schema_fn, ppt_schema)
        attach_pptx_export_fn(deck_manifest, pptx_filename)
        await ppt_generator_task_service.add_event(
            task_id,
            "step_done",
            "pptx_export",
            "PPTX export finalized",
            progress=92,
        )

        if req.generate_talking_script:
            await ppt_generator_task_service.add_event(
                task_id,
                "step_start",
                "script",
                "Generating talking script",
                progress=94,
            )
            script_payload = await build_script_payload(
                req=req,
                slides_results=slides_results,
                resolved_provider=resolved_provider,
                chapter_summarizer_cls=chapter_summarizer_cls,
                generate_talking_script_word_fn=generate_talking_script_word_fn,
                config=config,
                title=title,
            )
            await ppt_generator_task_service.add_event(
                task_id,
                "step_done",
                "script",
                "Talking script generated",
                progress=98,
            )

        await ppt_generator_task_service.add_event(
            task_id,
            "step_done",
            "complete",
            "Packaging response",
            progress=99,
        )

        result = build_success_result(
            slides_results=slides_results,
            ppt_schema=ppt_schema,
            runtime=runtime,
            resolved_provider=resolved_provider,
            selected_theme=selected_theme,
            deck_manifest=deck_manifest,
            outline=outline,
            outline_to_markdown_fn=outline_to_markdown_fn,
            script_payload=script_payload,
        )
        await ppt_generator_task_service.complete(task_id, result)
        await persist_success_history(
            user=user,
            task_id=task_id,
            ppt_generator_task_service=ppt_generator_task_service,
            persist_generate_v2_history_fn=persist_generate_v2_history_fn,
            req=req,
            runtime=runtime,
            title=title,
            result=result,
            slides_results=slides_results,
            pptx_filename=pptx_filename,
            deck_manifest=deck_manifest,
            script_payload=script_payload,
            logger=logger,
        )

    except Exception as exc:  # noqa: BLE001
        logger.exception("[slides.generate_v2][%s] failed", task_id)
        await ppt_generator_task_service.fail(task_id, str(exc), step="generate_v2")
        task = await ppt_generator_task_service.get_task(task_id) if user and user.get("id") else None
        failed_result = build_failed_result(
            exc=exc,
            task_id=task_id,
            task=task,
            runtime=runtime,
            deck_manifest=deck_manifest,
        )
        await persist_failure_history(
            user=user,
            task_id=task_id,
            ppt_generator_task_service=ppt_generator_task_service,
            persist_generate_v2_history_fn=persist_generate_v2_history_fn,
            req=req,
            runtime=runtime,
            title=title,
            result=failed_result,
            slides_results=slides_results,
            pptx_filename=pptx_filename,
            deck_manifest=deck_manifest,
            script_payload=script_payload,
            logger=logger,
        )

