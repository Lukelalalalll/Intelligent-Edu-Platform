from __future__ import annotations

from fastapi import HTTPException


THEMES_PAYLOAD = {
    "themes": [
        {
            "id": "minimalist",
            "name": "Minimalist (Academic)",
            "description": "Clean, academic style with serif fonts and warm accent colors.",
            "preview_colors": ["#ffffff", "#333333", "#2d6a4f"],
        },
        {
            "id": "neon_tech",
            "name": "Neon Tech",
            "description": "Dark tech aesthetic with neon glow effects and monospace fonts.",
            "preview_colors": ["#0a0a1a", "#00ff88", "#ff00aa"],
        },
        {
            "id": "corporate",
            "name": "Corporate Blue",
            "description": "Professional blue-gray palette, modern sans-serif layout.",
            "preview_colors": ["#f8f9fa", "#1a365d", "#2b6cb0"],
        },
    ]
}


async def summarize_highlights_impl(req, user: dict, request, *, task_tracker_cls, step_status, save_slides_history, logger):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = task_tracker_cls(request_id=request_id, user_id=user.get("id", ""), task_type="summarize")

    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer
        from backend.services.slides.infra.checkpoint_manager import CheckpointManager, _compute_hash

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
            tracker.finish(step_status.SUCCESS)
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
        overall_status = "failed" if failed and len(failed) == len(results) else "partial_success" if failed else "success"
        tracker.finish(step_status.SUCCESS if overall_status != "failed" else step_status.FAILED)
        tracker.result_metadata["slides_generated"] = len(results)
        tracker.result_metadata["slides_failed"] = len(failed)
        await CheckpointManager.save(
            task_id=tracker.request_id,
            step="summarize",
            output=results,
            input_data=input_for_hash,
            user_id=user.get("id", ""),
        )
        await tracker.save()

        response = {"status": overall_status, "results": results, "request_id": tracker.request_id}
        if failed:
            response["failed_sections"] = [
                {"slide_number": item["slide_number"], "error": item.get("_error", "unknown")}
                for item in failed
            ]

        try:
            await save_slides_history(
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
        tracker.finish(step_status.FAILED)
        raise
    except Exception:
        tracker.finish(step_status.FAILED)
        logger.exception("[%s] Summarize failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


async def summarize_chapters_impl(req, user: dict, request, *, task_tracker_cls, step_status, logger):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = task_tracker_cls(request_id=request_id, user_id=user.get("id", ""), task_type="summarize_chapters")
    try:
        from backend.services.slides.generation.section_summarizer import SectionSummarizer

        summarizer = SectionSummarizer()
        with tracker.step("summarize", chapters_count=len(req.chapterData), total_pages=req.total_pages):
            results = await summarizer.summarize_sections(req.chapterData, req.num_of_bullets, req.words_each_bullet)
        tracker.finish(step_status.SUCCESS)
        await tracker.save()
        return {"status": "success", "results": results[:req.total_pages], "request_id": tracker.request_id}
    except Exception:
        tracker.finish(step_status.FAILED)
        logger.exception("[%s] Chapter summarization failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


async def generate_talking_script_impl(req, user: dict, request, *, task_tracker_cls, step_status, resolve_provider, generate_script, logger):
    request_id = request.headers.get("X-Request-ID") if request else None
    tracker = task_tracker_cls(request_id=request_id, user_id=user.get("id", ""), task_type="script_generate")
    try:
        resolved_provider = resolve_provider(req.provider, feature="slides.generate_script", user=user)
        with tracker.step("script_generate", slides_count=len(req.slides_results), style=req.script_style):
            scripts, filename = await generate_script(
                slides_results=req.slides_results,
                style=req.script_style,
                title=req.presentation_title,
                provider=resolved_provider,
            )

        tracker.finish(step_status.SUCCESS)
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
        tracker.finish(step_status.FAILED)
        logger.exception("[%s] Script generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")
