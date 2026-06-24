from __future__ import annotations

import uuid

from fastapi import Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete, select

from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.template import TemplateModel
from models.sql.template_create_info import TemplateCreateInfoModel
from services.database import get_async_session
from templates.handler_support.code_normalization import _update_layout_id_in_code
from templates.handler_support.models import (
    CloneSlideLayoutRequest,
    CloneTemplateRequest,
    SaveSlideLayoutRequest,
    SaveTemplateLayoutData,
    SaveTemplateRequest,
    SaveTemplateResponse,
    UpdateTemplateRequest,
)


def _parse_custom_template_id(raw_template_id: str, *, empty_message: str) -> uuid.UUID:
    if not raw_template_id or not raw_template_id.strip():
        raise HTTPException(status_code=400, detail=empty_message)
    try:
        return uuid.UUID(raw_template_id.replace("custom-", ""))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid custom template ID") from exc


async def save_template(
    request: SaveTemplateRequest,
    sql_session: AsyncSession = Depends(get_async_session),
) -> SaveTemplateResponse:
    if not request.layouts:
        raise HTTPException(status_code=400, detail="Layouts are required")

    template_info = await sql_session.get(TemplateCreateInfoModel, request.template_info_id)
    if not template_info:
        raise HTTPException(status_code=400, detail="Template info not found")

    template = TemplateModel(
        id=uuid.uuid4(),
        name=request.name,
        description=request.description,
    )
    sql_session.add(template)
    sql_session.add_all(
        [
            PresentationLayoutCodeModel(
                presentation=template.id,
                layout_id=layout.layout_id,
                layout_name=layout.layout_name,
                layout_code=layout.layout_code,
                fonts=template_info.fonts,
            )
            for layout in request.layouts
        ]
    )
    await sql_session.commit()
    await sql_session.refresh(template)

    return SaveTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        created_at=template.created_at,
    )


async def clone_template(
    request: CloneTemplateRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
) -> SaveTemplateResponse:
    template_id_uuid = _parse_custom_template_id(
        request.id,
        empty_message="Template ID cannot be empty",
    )
    template = await sql_session.get(TemplateModel, template_id_uuid)
    if not template:
        raise HTTPException(
            status_code=400,
            detail="Template not found. Please use a valid template.",
        )

    result = await sql_session.execute(
        select(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == template_id_uuid
        )
    )
    layouts_db = result.scalars().all()
    if not layouts_db:
        raise HTTPException(status_code=400, detail="No layouts found for template")

    new_template = TemplateModel(
        id=uuid.uuid4(),
        name=request.name,
        description=template.description if request.description is None else request.description,
    )
    sql_session.add(new_template)
    sql_session.add_all(
        [
            PresentationLayoutCodeModel(
                presentation=new_template.id,
                layout_id=layout.layout_id,
                layout_name=layout.layout_name,
                layout_code=layout.layout_code,
                fonts=layout.fonts,
            )
            for layout in layouts_db
        ]
    )
    await sql_session.commit()
    await sql_session.refresh(new_template)

    return SaveTemplateResponse(
        id=new_template.id,
        name=new_template.name,
        description=new_template.description,
        created_at=new_template.created_at,
    )


async def update_template(
    request: UpdateTemplateRequest,
    sql_session: AsyncSession = Depends(get_async_session),
) -> SaveTemplateResponse:
    if not request.layouts:
        raise HTTPException(status_code=400, detail="Layouts are required")

    template = await sql_session.get(TemplateModel, request.id)
    if not template:
        raise HTTPException(status_code=400, detail="Template not found")

    existing_layout = await sql_session.scalar(
        select(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == request.id
        )
    )
    fonts = existing_layout.fonts if existing_layout else None

    await sql_session.execute(
        delete(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == request.id
        )
    )
    sql_session.add_all(
        [
            PresentationLayoutCodeModel(
                presentation=template.id,
                layout_id=layout.layout_id,
                layout_name=layout.layout_name,
                layout_code=layout.layout_code,
                fonts=fonts,
            )
            for layout in request.layouts
        ]
    )
    await sql_session.commit()

    return SaveTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        created_at=template.created_at,
    )


async def save_slide_layout(
    request: SaveSlideLayoutRequest,
    sql_session: AsyncSession = Depends(get_async_session),
) -> None:
    template = await sql_session.get(TemplateModel, request.template_id)
    if not template:
        raise HTTPException(status_code=400, detail="Template not found")

    layout = await sql_session.scalar(
        select(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == request.template_id,
            PresentationLayoutCodeModel.layout_id == request.layout_id,
        )
    )
    if not layout:
        raise HTTPException(status_code=400, detail="Layout not found")

    layout.layout_code = request.layout_code
    sql_session.add(layout)
    await sql_session.commit()


async def clone_slide_layout(
    request: CloneSlideLayoutRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
) -> SaveTemplateLayoutData:
    template_id_uuid = _parse_custom_template_id(
        request.template_id,
        empty_message="Template ID cannot be empty",
    )
    template = await sql_session.get(TemplateModel, template_id_uuid)
    if not template:
        raise HTTPException(status_code=400, detail="Template not found")

    layout = await sql_session.scalar(
        select(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == template_id_uuid,
            PresentationLayoutCodeModel.layout_id == request.layout_id,
        )
    )
    if not layout:
        raise HTTPException(status_code=400, detail="Layout not found")

    new_layout_code, new_layout_id = _update_layout_id_in_code(layout.layout_code)
    new_layout = PresentationLayoutCodeModel(
        presentation=template_id_uuid,
        layout_id=new_layout_id,
        layout_name=request.layout_name or layout.layout_name,
        layout_code=new_layout_code,
        fonts=layout.fonts,
    )
    sql_session.add(new_layout)
    await sql_session.commit()
    await sql_session.refresh(new_layout)

    return SaveTemplateLayoutData(
        layout_id=new_layout.layout_id,
        layout_name=new_layout.layout_name,
        layout_code=new_layout.layout_code,
    )
