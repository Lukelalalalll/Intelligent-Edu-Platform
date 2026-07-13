from __future__ import annotations

import traceback
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from constants.presentation import DEFAULT_TEMPLATES, MAX_NUMBER_OF_SLIDES
from models.generate_presentation_request import GeneratePresentationRequest
from models.presentation_and_path import PresentationPathAndEditPath
from models.sql.async_presentation_generation_status import AsyncPresentationGenerationTaskModel
from models.sql.template import TemplateModel
from services.database import get_async_session
from utils.presentation_request import infer_requested_slide_count

from .generation_workflow import generate_presentation_handler
from .helpers import build_export_cookie_header, build_export_web_origin, build_owner_user_id

generation_router = APIRouter()


async def check_if_api_request_is_valid(
    request: GeneratePresentationRequest,
    sql_session: AsyncSession,
) -> tuple[uuid.UUID]:
    presentation_id = uuid.uuid4()
    print(f"Presentation ID: {presentation_id}")
    if not (request.content or request.slides_markdown or request.files):
        raise HTTPException(
            status_code=400,
            detail="Either content or slides markdown or files is required to generate presentation",
        )
    if request.n_slides is None:
        request.n_slides = infer_requested_slide_count(
            request.content,
            maximum=MAX_NUMBER_OF_SLIDES,
        )

    if request.n_slides is not None and request.n_slides <= 0:
        raise HTTPException(status_code=400, detail="Number of slides must be greater than 0")
    if request.n_slides is not None and request.n_slides > MAX_NUMBER_OF_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"Number of slides cannot be greater than {MAX_NUMBER_OF_SLIDES}",
        )
    if request.include_table_of_contents and request.n_slides is not None and request.n_slides < 3:
        raise HTTPException(
            status_code=400,
            detail="Number of slides cannot be less than 3 if table of contents is included",
        )

    if request.template not in DEFAULT_TEMPLATES:
        request.template = request.template.lower()
        if not request.template.startswith("custom-"):
            raise HTTPException(status_code=400, detail="Template not found. Please use a valid template.")
        template_id = request.template.replace("custom-", "")
        try:
            template = await sql_session.get(TemplateModel, uuid.UUID(template_id))
            if not template:
                raise Exception()
        except Exception:
            raise HTTPException(status_code=400, detail="Template not found. Please use a valid template.")
    return (presentation_id,)


@generation_router.post("/generate", response_model=PresentationPathAndEditPath)
async def generate_presentation_sync(
    request_http: Request,
    request: GeneratePresentationRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    try:
        (presentation_id,) = await check_if_api_request_is_valid(request, sql_session)
        return await generate_presentation_handler(
            request,
            presentation_id,
            None,
            export_cookie_header=build_export_cookie_header(request_http),
            export_web_origin=build_export_web_origin(request_http),
            owner_user_id=build_owner_user_id(request_http),
            sql_session=sql_session,
        )
    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Presentation generation failed")


@generation_router.post("/generate/async", response_model=AsyncPresentationGenerationTaskModel)
async def generate_presentation_async(
    request_http: Request,
    request: GeneratePresentationRequest,
    background_tasks: BackgroundTasks,
    sql_session: AsyncSession = Depends(get_async_session),
):
    try:
        (presentation_id,) = await check_if_api_request_is_valid(request, sql_session)
        async_status = AsyncPresentationGenerationTaskModel(status="pending", message="Queued for generation", data=None)
        sql_session.add(async_status)
        await sql_session.commit()
        background_tasks.add_task(
            generate_presentation_handler,
            request,
            presentation_id,
            async_status=async_status,
            export_cookie_header=build_export_cookie_header(request_http),
            export_web_origin=build_export_web_origin(request_http),
            owner_user_id=build_owner_user_id(request_http),
            sql_session=sql_session,
        )
        return async_status
    except Exception as exc:
        if not isinstance(exc, HTTPException):
            print(exc)
            exc = HTTPException(status_code=500, detail="Presentation generation failed")
        raise exc


@generation_router.get("/status/{id}", response_model=AsyncPresentationGenerationTaskModel)
async def check_async_presentation_generation_status(
    id: str = Path(description="ID of the presentation generation task"),
    sql_session: AsyncSession = Depends(get_async_session),
):
    status = await sql_session.get(AsyncPresentationGenerationTaskModel, id)
    if not status:
        raise HTTPException(status_code=404, detail="No presentation generation task found")
    return status
