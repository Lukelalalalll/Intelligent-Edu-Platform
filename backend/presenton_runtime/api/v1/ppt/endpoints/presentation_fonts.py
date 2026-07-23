from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.presentation import PresentationModel
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sql.slide import SlideModel


def extract_custom_template_id(layout_name: Optional[str]) -> Optional[uuid.UUID]:
    if not layout_name or not layout_name.startswith("custom-"):
        return None
    try:
        return uuid.UUID(layout_name.replace("custom-", ""))
    except Exception:
        return None


async def resolve_presentation_fonts(
    presentation: PresentationModel,
    slides: List[SlideModel],
    sql_session: AsyncSession,
):
    candidate_template_ids: List[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    layout_name = presentation.layout.get("name") if isinstance(presentation.layout, dict) else None
    layout_template_id = extract_custom_template_id(layout_name)
    if layout_template_id and layout_template_id not in seen:
        candidate_template_ids.append(layout_template_id)
        seen.add(layout_template_id)

    for slide in slides:
        template_id = extract_custom_template_id(slide.layout_group)
        if template_id and template_id not in seen:
            candidate_template_ids.append(template_id)
            seen.add(template_id)

    for template_id in candidate_template_ids:
        result = await sql_session.execute(
            select(PresentationLayoutCodeModel.fonts).where(PresentationLayoutCodeModel.presentation == template_id)
        )
        fonts_list = result.scalars().all()
        for fonts in fonts_list:
            if fonts is not None:
                return fonts
    return None
