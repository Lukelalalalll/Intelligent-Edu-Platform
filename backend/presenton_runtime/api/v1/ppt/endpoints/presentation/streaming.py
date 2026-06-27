from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from models.presentation_with_slides import PresentationWithSlides
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sse_response import SSECompleteResponse, SSEErrorResponse, SSEResponse, SSEStatusResponse
from services.database import get_async_session
from services.image_generation_service import ImageGenerationService
from utils.asset_directory_utils import get_images_directory
from utils.llm_calls.generate_slide_content import get_slide_content_from_type_and_outline
from utils.outline_utils import get_images_for_slides_from_outline
from utils.presentation_language import (
    AUTO_PRESENTATION_LANGUAGE,
    normalize_presentation_language,
)
from utils.process_slides import process_slide_add_placeholder_assets, process_slide_and_fetch_assets

from .helpers import resolve_presentation_fonts, with_sse_heartbeats

logger = logging.getLogger(__name__)
stream_router = APIRouter()


@stream_router.get("/stream/{id}", response_model=PresentationWithSlides)
async def stream_presentation(id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    if not presentation.structure:
        raise HTTPException(status_code=400, detail="Presentation not prepared for stream")
    if not presentation.outlines:
        raise HTTPException(status_code=400, detail="Outlines can not be empty")

    presentation_language = normalize_presentation_language(presentation.language) or AUTO_PRESENTATION_LANGUAGE

    image_generation_service = ImageGenerationService(get_images_directory())
    structure = presentation.get_structure()
    logger.info("[presentation.stream] start presentation_id=%s total_slides=%d", id, len(structure.slides))

    async def inner():
        yield SSEStatusResponse(status="starting").to_string()
        layout = presentation.get_layout()
        icon_weight = layout.icon_weight
        outline = presentation.get_presentation_outline()
        image_urls_for_slides = get_images_for_slides_from_outline(outline.slides)

        try:
            async_assets_generation_tasks: List[asyncio.Task] = []
            asset_events: asyncio.Queue = asyncio.Queue()
            asset_warnings_by_slide: dict[int, list[dict]] = {}

            async def notify_slide_assets_ready(slide_index: int, asset_task: asyncio.Task):
                try:
                    await asset_task
                finally:
                    await asset_events.put(slide_index)

            slides: List[SlideModel] = []
            logger.info("[presentation.stream] first_chunk presentation_id=%s", id)
            yield SSEResponse(event="response", data=json.dumps({"type": "chunk", "chunk": '{ "slides": [ '})).to_string()
            yielded_slide_asset_sse_count = 0

            for i, slide_layout_index in enumerate(structure.slides):
                slide_layout = layout.slides[slide_layout_index]
                try:
                    slide_content = await get_slide_content_from_type_and_outline(
                        slide_layout,
                        outline.slides[i],
                        presentation_language,
                        presentation.tone,
                        presentation.verbosity,
                        presentation.instructions,
                    )
                except HTTPException as exc:
                    yield SSEErrorResponse(detail=exc.detail).to_string()
                    return

                slide = SlideModel(
                    presentation=id,
                    layout_group=layout.name,
                    layout=slide_layout.id,
                    index=i,
                    speaker_note=slide_content.get("__speaker_note__", ""),
                    content=slide_content,
                )
                slides.append(slide)
                process_slide_add_placeholder_assets(slide)

                asset_warnings_by_slide[i] = []
                asset_task = asyncio.create_task(
                    process_slide_and_fetch_assets(
                        image_generation_service,
                        slide,
                        outline_image_urls=image_urls_for_slides[i] if i < len(image_urls_for_slides) else None,
                        icon_weight=icon_weight,
                        allow_image_fallback=True,
                        image_warnings=asset_warnings_by_slide[i],
                    )
                )
                async_assets_generation_tasks.append(asset_task)
                asyncio.create_task(notify_slide_assets_ready(i, asset_task))

                yield SSEResponse(event="response", data=json.dumps({"type": "chunk", "chunk": slide.model_dump_json()})).to_string()
                while True:
                    try:
                        done_idx = asset_events.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                    yielded_slide_asset_sse_count += 1
                    yield SSEResponse(
                        event="response",
                        data=json.dumps(
                            {
                                "type": "slide_assets",
                                "slide_index": done_idx,
                                "slide": slides[done_idx].model_dump(mode="json"),
                                "warnings": asset_warnings_by_slide.get(done_idx, []),
                            }
                        ),
                    ).to_string()

            yield SSEResponse(event="response", data=json.dumps({"type": "chunk", "chunk": " ] }"})).to_string()
            while yielded_slide_asset_sse_count < len(slides):
                done_idx = await asset_events.get()
                yielded_slide_asset_sse_count += 1
                yield SSEResponse(
                    event="response",
                    data=json.dumps(
                        {
                            "type": "slide_assets",
                            "slide_index": done_idx,
                            "slide": slides[done_idx].model_dump(mode="json"),
                            "warnings": asset_warnings_by_slide.get(done_idx, []),
                        }
                    ),
                ).to_string()

            generated_assets = [asset for assets_list in await asyncio.gather(*async_assets_generation_tasks) for asset in assets_list]
            await sql_session.execute(delete(SlideModel).where(SlideModel.presentation == id))
            await sql_session.commit()
            sql_session.add(presentation)
            sql_session.add_all(slides)
            sql_session.add_all(generated_assets)
            await sql_session.commit()

            response = PresentationWithSlides(
                **presentation.model_dump(),
                slides=slides,
                fonts=await resolve_presentation_fonts(presentation, slides, sql_session),
            )
            logger.info("[presentation.stream] complete presentation_id=%s slide_count=%d", id, len(slides))
            yield SSECompleteResponse(key="presentation", value=response.model_dump(mode="json")).to_string()
        except asyncio.CancelledError:
            logger.info("[presentation.stream] cancelled presentation_id=%s", id)
            raise
        except Exception as exc:
            detail = exc.detail if isinstance(exc, HTTPException) and isinstance(exc.detail, str) else "Presentation streaming failed"
            logger.exception("[presentation.stream] exception presentation_id=%s", id)
            yield SSEErrorResponse(detail=detail).to_string()

    return StreamingResponse(with_sse_heartbeats(inner(), id), media_type="text/event-stream")
