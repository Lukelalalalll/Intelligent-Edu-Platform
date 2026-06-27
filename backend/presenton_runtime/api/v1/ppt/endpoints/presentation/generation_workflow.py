from __future__ import annotations

import logging
import traceback
import uuid
from datetime import datetime
from typing import Optional

import dirtyjson
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.presenton.presenton_projection_service import PRESENTON_MONGO_PROJECTION_SERVICE
from enums.webhook_event import WebhookEvent
from models.api_error_model import APIErrorModel
from models.generate_presentation_request import GeneratePresentationRequest
from models.presentation_and_path import PresentationPathAndEditPath
from models.presentation_outline_model import PresentationOutlineModel, SlideOutlineModel
from models.sql.async_presentation_generation_status import AsyncPresentationGenerationTaskModel
from services.concurrent_service import CONCURRENT_SERVICE
from services.documents_loader import DocumentsLoader
from services.mem0_presentation_memory_service import MEM0_PRESENTATION_MEMORY_SERVICE
from services.webhook_service import WebhookService
from utils.export_utils import export_presentation
from utils.llm_calls.generate_presentation_outlines import (
    generate_ppt_outline,
    get_messages as get_outline_messages,
)
from utils.llm_utils import message_content_to_text
from utils.outline_utils import get_no_of_outlines_to_generate_for_n_slides
from utils.presentation_language import (
    AUTO_PRESENTATION_LANGUAGE,
    normalize_presentation_language,
)

from .helpers import build_edit_path
from .slide_builder import build_presentation_assets

logger = logging.getLogger(__name__)


async def generate_presentation_handler(
    request: GeneratePresentationRequest,
    presentation_id: uuid.UUID,
    async_status: Optional[AsyncPresentationGenerationTaskModel],
    export_cookie_header: Optional[str] = None,
    export_web_origin: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    sql_session: AsyncSession | None = None,
):
    assert sql_session is not None
    try:
        language_to_use = normalize_presentation_language(request.language) or AUTO_PRESENTATION_LANGUAGE
        presentation_outlines, total_outlines, using_slides_markdown = await _load_or_generate_outlines(
            request=request,
            presentation_id=presentation_id,
            async_status=async_status,
            sql_session=sql_session,
            language_to_use=language_to_use,
        )
        await _set_async_status(sql_session, async_status, message="Selecting layout for each slide")
        await _set_async_status(sql_session, async_status, message="Generating slides")
        presentation, slides, generated_assets = await build_presentation_assets(
            request=request,
            presentation_id=presentation_id,
            presentation_outlines=presentation_outlines,
            total_outlines=total_outlines,
            using_slides_markdown=using_slides_markdown,
            language_to_use=language_to_use,
        )
        sql_session.add(presentation)
        sql_session.add_all(slides)
        sql_session.add_all(generated_assets)
        await sql_session.commit()
        await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
            sql_session,
            presentation_id=presentation.id,
            owner_user_id=owner_user_id,
            reason="generate_presentation_handler",
        )

        await _set_async_status(sql_session, async_status, message="Exporting presentation", commit=False)
        presentation_and_path = await export_presentation(
            presentation_id,
            presentation.title or str(uuid.uuid4()),
            request.export_as,
            cookie_header=export_cookie_header,
            web_origin=export_web_origin,
        )
        response = PresentationPathAndEditPath(
            **presentation_and_path.model_dump(),
            edit_path=build_edit_path(presentation_id),
        )
        await _set_async_status(
            sql_session,
            async_status,
            message="Presentation generation completed",
            status="completed",
            data=response.model_dump(mode="json"),
        )
        CONCURRENT_SERVICE.run_task(
            None,
            WebhookService.send_webhook,
            WebhookEvent.PRESENTATION_GENERATION_COMPLETED,
            response.model_dump(mode="json"),
        )
        return response
    except Exception as exc:
        if not isinstance(exc, HTTPException):
            traceback.print_exc()
            exc = HTTPException(status_code=500, detail="Presentation generation failed")
        api_error_model = APIErrorModel.from_exception(exc)
        CONCURRENT_SERVICE.run_task(
            None,
            WebhookService.send_webhook,
            WebhookEvent.PRESENTATION_GENERATION_FAILED,
            api_error_model.model_dump(mode="json"),
        )
        if async_status:
            await _set_async_status(
                sql_session,
                async_status,
                message="Presentation generation failed",
                status="error",
                error=api_error_model.model_dump(mode="json"),
            )
        else:
            raise exc


async def _set_async_status(
    sql_session: AsyncSession,
    async_status: Optional[AsyncPresentationGenerationTaskModel],
    *,
    message: str,
    status: str | None = None,
    data=None,
    error=None,
    commit: bool = True,
) -> None:
    if not async_status:
        return
    async_status.message = message
    async_status.updated_at = datetime.now()
    if status is not None:
        async_status.status = status
    if data is not None:
        async_status.data = data
    if error is not None:
        async_status.error = error
    sql_session.add(async_status)
    if commit:
        await sql_session.commit()


async def _load_or_generate_outlines(
    *,
    request: GeneratePresentationRequest,
    presentation_id: uuid.UUID,
    async_status: Optional[AsyncPresentationGenerationTaskModel],
    sql_session: AsyncSession,
    language_to_use: str | None,
) -> tuple[PresentationOutlineModel, int, bool]:
    using_slides_markdown = bool(request.slides_markdown)
    if using_slides_markdown:
        request.n_slides = len(request.slides_markdown)
        outlines = PresentationOutlineModel(slides=[SlideOutlineModel(content=slide) for slide in request.slides_markdown])
        await MEM0_PRESENTATION_MEMORY_SERVICE.store_generation_context(
            presentation_id=presentation_id,
            system_prompt=None,
            user_prompt=None,
            extracted_document_text=None,
            source_content=request.content,
            instructions=request.instructions,
        )
        await MEM0_PRESENTATION_MEMORY_SERVICE.store_generated_outlines(presentation_id, outlines.model_dump(mode="json"))
        return outlines, len(request.slides_markdown), True

    await _set_async_status(sql_session, async_status, message="Generating presentation outlines")
    additional_context = ""
    if request.files:
        documents_loader = DocumentsLoader(file_paths=request.files, presentation_language=language_to_use)
        await documents_loader.load_documents()
        if documents_loader.documents:
            additional_context = "\n\n".join(documents_loader.documents)

    n_slides_to_generate = request.n_slides
    if request.include_table_of_contents and request.n_slides is not None:
        n_slides_to_generate = get_no_of_outlines_to_generate_for_n_slides(
            n_slides=request.n_slides,
            toc=True,
            title_slide=request.include_title_slide,
        )
    outline_messages = get_outline_messages(
        request.content,
        n_slides_to_generate,
        language_to_use,
        additional_context,
        request.tone.value,
        request.verbosity.value,
        request.instructions,
        request.include_title_slide,
        request.include_table_of_contents,
    )
    await MEM0_PRESENTATION_MEMORY_SERVICE.store_generation_context(
        presentation_id=presentation_id,
        system_prompt=message_content_to_text(outline_messages[0].content) if len(outline_messages) > 0 else None,
        user_prompt=message_content_to_text(outline_messages[1].content) if len(outline_messages) > 1 else None,
        extracted_document_text=additional_context,
        source_content=request.content,
        instructions=request.instructions,
    )

    presentation_outlines_text = ""
    async for chunk in generate_ppt_outline(
        request.content,
        n_slides_to_generate,
        language_to_use,
        additional_context,
        request.tone.value,
        request.verbosity.value,
        request.instructions,
        request.include_title_slide,
        request.web_search,
        request.include_table_of_contents,
    ):
        if isinstance(chunk, HTTPException):
            raise chunk
        presentation_outlines_text += chunk
    try:
        presentation_outlines_json = dict(dirtyjson.loads(presentation_outlines_text))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail="Failed to generate presentation outlines. Please try again.")

    outlines = PresentationOutlineModel(**presentation_outlines_json)
    if n_slides_to_generate is not None and len(outlines.slides) != n_slides_to_generate:
        raise HTTPException(
            status_code=400,
            detail="Failed to generate presentation outlines with requested number of slides. Please try again.",
        )
    await MEM0_PRESENTATION_MEMORY_SERVICE.store_generated_outlines(presentation_id, outlines.model_dump(mode="json"))
    return outlines, len(outlines.slides), False
