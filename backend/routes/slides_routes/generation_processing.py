from __future__ import annotations

import asyncio

from fastapi import HTTPException


async def process_ppt_impl(req, request, user: dict, *, task_tracker_cls, step_status, checkpoint_manager_cls, create_ppt_impl, logger):
    request_id = request.headers.get("X-Request-ID") or None
    tracker = task_tracker_cls(request_id=request_id, user_id=user.get("id", ""), task_type="ppt_generate")
    try:
        if not req.ppt_schema:
            raise ValueError("ppt_schema is required")

        slides_count = len(req.ppt_schema.get("slides", []) if isinstance(req.ppt_schema, dict) else [])
        with tracker.step("ppt_generate", slides_count=slides_count):
            filename = await asyncio.to_thread(create_ppt_impl, req.ppt_schema)

        tracker.finish(step_status.SUCCESS)
        tracker.result_metadata["filename"] = filename
        await checkpoint_manager_cls.save(
            task_id=tracker.request_id,
            step="ppt_generate",
            output={"filename": filename, "download_url": f"/api/sub1/download_ppt/{filename}"},
            input_data=req.ppt_schema if isinstance(req.ppt_schema, dict) else None,
            user_id=user.get("id", ""),
        )
        await tracker.save()
        return {
            "status": "success",
            "filename": filename,
            "download_url": f"/api/slides/download_ppt/{filename}",
            "request_id": tracker.request_id,
        }
    except ValueError as exc:
        tracker.finish(step_status.FAILED)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        tracker.finish(step_status.FAILED)
        logger.exception("[%s] PPT generation failed", tracker.request_id)
        raise HTTPException(status_code=500, detail="Internal server error")


async def coze_generate_outline_impl(req, user: dict, *, resolve_provider, generate_outline, save_slides_history, logger):
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(400, "Keywords must not be empty")

    resolved_provider = resolve_provider(req.provider, feature="slides.generate_outline", user=user)
    text = await generate_outline(keywords, provider=resolved_provider)
    try:
        await save_slides_history(
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


async def process_text_impl(req, user: dict, *, process_text_to_md, save_slides_history, logger):
    text = req.text.strip()
    title = req.title.strip() or "untitled"
    if not text:
        raise HTTPException(400, "Text must not be empty")

    try:
        filename, sections_count = process_text_to_md(text, title)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    logger.info("process-text: wrote %d sections to %s", sections_count, filename)
    try:
        await save_slides_history(
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
