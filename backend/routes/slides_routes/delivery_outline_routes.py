from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.core.security import get_current_user
from backend.schemas import PresentonAssistantMessageSchema, PresentonOutlineRequestSchema
from backend.services.ai_gateway_service.provider_factory import get_ai_gateway_service

router = APIRouter()


def _delivery_module():
    from . import delivery as delivery_module

    return delivery_module


@router.post("/presenton/outline")
async def generate_presenton_outline(
    req: PresentonOutlineRequestSchema,
    user: dict = Depends(get_current_user),
    request: Request = None,
):
    delivery_module = _delivery_module()
    request_id = (request.headers.get("X-Request-ID") if request else None) or uuid.uuid4().hex
    runtime = await delivery_module._resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.presenton.outline",
        user=user,
        require_healthy=True,
    )
    source_text, chapter_data_clean = delivery_module._extract_source_text_and_chapters(req.content, req.chapterData)
    if not source_text:
        raise HTTPException(status_code=400, detail="content or chapterData is required")

    total_pages = max(1, min(int(req.total_pages or 8), 40))
    adapter = delivery_module.PresentonAdapterService(runtime=runtime)
    outline = await adapter.generate_outline(
        source_text=source_text,
        total_pages=total_pages,
        chapter_data=chapter_data_clean,
    )
    title = (req.presentation_title or "").strip() or (req.source_display_name or "").strip() or "Generated Presentation"
    slides = []
    for idx, item in enumerate(outline, start=1):
        normalized = delivery_module._normalize_outline_slide(item, idx)
        slides.append(
            {
                "id": f"slide-{idx}",
                "index": idx,
                "title": normalized["title"],
                "objective": normalized["objective"],
                "key_points": normalized["key_points"],
                "content": normalized["content"],
            }
        )

    return {
        "success": True,
        "request_id": request_id,
        "title": title,
        "provider_requested": runtime.requested_provider,
        "provider_resolved": runtime.provider_id,
        "provider_source": runtime.config_source,
        "provider_model": runtime.model,
        "slides": slides,
    }


@router.post("/presenton/assistant/stream")
async def stream_presenton_assistant(
    req: PresentonAssistantMessageSchema,
    user: dict = Depends(get_current_user),
):
    delivery_module = _delivery_module()
    runtime = await delivery_module._resolve_presenton_runtime(
        req.provider or "auto",
        feature="slides.presenton.assistant",
        user=user,
        require_healthy=True,
    )
    prompt = delivery_module._build_presenton_assistant_prompt(req)
    ai_gateway = get_ai_gateway_service()

    async def event_stream():
        try:
            async for chunk in ai_gateway.chat_stream_with_runtime(
                message=prompt,
                context={"surface": "presenton_assistant", "response_format": "text"},
                runtime=runtime,
            ):
                payload = json.dumps({"choices": [{"delta": {"content": chunk}}]}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as exc:  # noqa: BLE001
            error_payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {error_payload}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
