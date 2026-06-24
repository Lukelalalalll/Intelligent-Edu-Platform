from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Path, Query
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.presentation import DEFAULT_TEMPLATES
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.template import TemplateModel
from services.database import get_async_session
from templates.example import build_template_example
from templates.get_layout_by_name import get_layout_by_name
from templates.handler_support.models import (
    GetTemplateLayoutsResponse,
    TemplateData,
    TemplateDetail,
    TemplateExample,
    TemplateLayoutData,
)
from templates.presentation_layout import PresentationLayoutModel


async def get_all_templates(
    include_defaults: bool = Query(
        default=True,
        description="Whether to include default templates",
    ),
    sql_session: AsyncSession = Depends(get_async_session),
) -> list[TemplateDetail]:
    result = await sql_session.execute(
        select(
            TemplateModel.id,
            TemplateModel.name,
            func.count(PresentationLayoutCodeModel.id).label("total_layouts"),
        )
        .join(
            PresentationLayoutCodeModel,
            PresentationLayoutCodeModel.presentation == TemplateModel.id,
        )
        .group_by(TemplateModel.id, TemplateModel.name)
    )
    rows = result.all()

    templates: list[TemplateDetail] = []
    if include_defaults:
        templates.extend(
            TemplateDetail(id=template, name=template)
            for template in DEFAULT_TEMPLATES
        )

    templates.extend(
        TemplateDetail(
            id=f"custom-{template_id}",
            name=template_name,
            total_layouts=total_layouts,
        )
        for template_id, template_name, total_layouts in rows
    )
    return templates


async def get_layouts(
    template_id: str = Path(..., description="The id of the template"),
    session: AsyncSession = Depends(get_async_session),
) -> GetTemplateLayoutsResponse:
    if not template_id or not template_id.strip():
        raise HTTPException(status_code=400, detail="Template ID cannot be empty")

    try:
        template_id_uuid = uuid.UUID(template_id.replace("custom-", ""))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid custom template ID") from exc

    result = await session.execute(
        select(PresentationLayoutCodeModel).where(
            PresentationLayoutCodeModel.presentation == template_id_uuid
        )
    )
    layouts_db = result.scalars().all()
    if not layouts_db:
        raise HTTPException(
            status_code=404,
            detail=f"No layouts found for template ID: {template_id}",
        )

    template_meta = await session.get(TemplateModel, template_id_uuid)
    template = None
    if template_meta:
        template = TemplateData(
            id=template_id_uuid,
            init_id=None,
            name=template_meta.name,
            description=template_meta.description,
            created_at=template_meta.created_at,
        )

    layouts = [
        TemplateLayoutData(
            template=template_id_uuid,
            layout_id=layout.layout_id,
            layout_name=layout.layout_name,
            layout_code=layout.layout_code,
            fonts=layout.fonts,
        )
        for layout in layouts_db
    ]
    return GetTemplateLayoutsResponse(
        layouts=layouts,
        template=template,
        fonts=layouts[0].fonts if layouts else None,
    )


async def get_template_by_id(
    id: str = Path(
        ...,
        description=(
            "The id of the template, must be one of "
            f"{', '.join(DEFAULT_TEMPLATES)} or your custom template"
        ),
    ),
    sql_session: AsyncSession = Depends(get_async_session),
) -> PresentationLayoutModel:
    if id.startswith("custom-"):
        try:
            template_id = uuid.UUID(id.replace("custom-", ""))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="Template not found. Please use a valid template.",
            ) from exc

        template = await sql_session.get(TemplateModel, template_id)
        if not template:
            raise HTTPException(
                status_code=400,
                detail="Template not found. Please use a valid template.",
            )

    return await get_layout_by_name(id)


async def get_template_example(
    id: str = Path(
        ...,
        description=(
            "The id of the template, must be one of "
            f"{', '.join(DEFAULT_TEMPLATES)} or your custom template"
        ),
    ),
    sql_session: AsyncSession = Depends(get_async_session),
) -> TemplateExample:
    template = await get_template_by_id(id=id, sql_session=sql_session)
    return TemplateExample(**build_template_example(id, template))
