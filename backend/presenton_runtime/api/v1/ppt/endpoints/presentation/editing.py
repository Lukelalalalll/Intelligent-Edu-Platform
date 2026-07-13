from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.presentation_and_path import PresentationPathAndEditPath
from models.presentation_from_template import EditPresentationRequest
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.database import get_async_session
from utils.dict_utils import deep_update
from utils.export_utils import export_presentation

from .helpers import build_edit_path, build_export_cookie_header, build_export_web_origin

editing_router = APIRouter()


@editing_router.post("/edit", response_model=PresentationPathAndEditPath)
async def edit_presentation_with_new_content(
    request_http: Request,
    data: Annotated[EditPresentationRequest, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, data.presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = await sql_session.scalars(select(SlideModel).where(SlideModel.presentation == data.presentation_id))
    new_slides = []
    slides_to_delete = []
    for each_slide in slides:
        new_slide_data = list(filter(lambda x: x.index == each_slide.index, data.slides))
        if new_slide_data:
            updated_content = deep_update(each_slide.content, new_slide_data[0].content)
            new_slides.append(each_slide.get_new_slide(presentation.id, updated_content))
            slides_to_delete.append(each_slide.id)

    await sql_session.execute(delete(SlideModel).where(SlideModel.id.in_(slides_to_delete)))
    sql_session.add_all(new_slides)
    await sql_session.commit()

    presentation_and_path = await export_presentation(
        presentation.id,
        presentation.title or str(uuid.uuid4()),
        data.export_as,
        cookie_header=build_export_cookie_header(request_http),
        web_origin=build_export_web_origin(request_http),
    )
    return PresentationPathAndEditPath(**presentation_and_path.model_dump(), edit_path=build_edit_path(presentation.id))


@editing_router.post("/derive", response_model=PresentationPathAndEditPath)
async def derive_presentation_from_existing_one(
    request_http: Request,
    data: Annotated[EditPresentationRequest, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, data.presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = await sql_session.scalars(select(SlideModel).where(SlideModel.presentation == data.presentation_id))
    new_presentation = presentation.get_new_presentation()
    new_slides = []
    for each_slide in slides:
        updated_content = None
        new_slide_data = list(filter(lambda x: x.index == each_slide.index, data.slides))
        if new_slide_data:
            updated_content = deep_update(each_slide.content, new_slide_data[0].content)
        new_slides.append(each_slide.get_new_slide(new_presentation.id, updated_content))

    sql_session.add(new_presentation)
    sql_session.add_all(new_slides)
    await sql_session.commit()

    presentation_and_path = await export_presentation(
        new_presentation.id,
        new_presentation.title or str(uuid.uuid4()),
        data.export_as,
        cookie_header=build_export_cookie_header(request_http),
        web_origin=build_export_web_origin(request_http),
    )
    return PresentationPathAndEditPath(
        **presentation_and_path.model_dump(),
        edit_path=build_edit_path(new_presentation.id),
    )
