from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.chat.memory_layer_support.chat_memory_formatting import (
    build_snippet,
    extract_query_tokens,
    serialize_slide,
)
from templates.presentation_layout import SlideLayoutModel

LOGGER = logging.getLogger(__name__)


async def load_presentation(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
) -> PresentationModel | None:
    return await sql_session.get(PresentationModel, presentation_id)


async def get_outline(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
) -> dict[str, Any] | None:
    slides_result = await sql_session.scalars(
        select(SlideModel)
        .where(SlideModel.presentation == presentation_id)
        .order_by(SlideModel.index)
    )
    slides = list(slides_result)
    if slides:
        LOGGER.info(
            "Chat outline loaded from slides table (presentation_id=%s, slides=%d)",
            presentation_id,
            len(slides),
        )
        return {
            "source": "slides_table",
            "slide_count": len(slides),
            "slides": [
                {
                    "slide_id": str(slide.id),
                    "index": slide.index,
                    "layout_id": slide.layout,
                    "content": slide.content,
                    "speaker_note": slide.speaker_note,
                }
                for slide in slides
            ],
        }

    presentation = await load_presentation(sql_session, presentation_id)
    if not presentation or not presentation.outlines:
        LOGGER.info("Chat memory miss for outline (presentation_id=%s)", presentation_id)
        return None

    LOGGER.info(
        "Chat outline fallback hit from presentation.outlines (presentation_id=%s)",
        presentation_id,
    )
    return presentation.outlines


async def search_slides(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    trimmed_query = (query or "").strip()
    if not trimmed_query:
        return []

    slides_result = await sql_session.scalars(
        select(SlideModel).where(SlideModel.presentation == presentation_id)
    )
    slides = sorted(list(slides_result), key=lambda slide: slide.index)
    if not slides:
        LOGGER.info(
            "Chat memory miss for slide search (presentation_id=%s, reason=no_slides)",
            presentation_id,
        )
        return []

    query_lower = trimmed_query.lower()
    query_tokens = extract_query_tokens(query_lower)
    ranked: list[tuple[int, dict[str, Any]]] = []
    for slide in slides:
        serialized = serialize_slide(slide)
        searchable = serialized.lower()

        score = 0
        if query_lower in searchable:
            score += 8
        if query_tokens:
            score += sum(1 for token in query_tokens if token in searchable)
        if score <= 0:
            continue

        ranked.append(
            (
                score,
                {
                    "slide_id": str(slide.id),
                    "index": slide.index,
                    "slide_number": slide.index + 1,
                    "layout_id": slide.layout,
                    "snippet": build_snippet(serialized, query_lower),
                    "score": score,
                },
            )
        )

    ranked.sort(key=lambda item: (-item[0], item[1]["index"]))
    results = [entry for _, entry in ranked[: max(1, limit)]]
    LOGGER.info(
        "Chat DB slide search completed (presentation_id=%s, query=%r, hits=%d)",
        presentation_id,
        trimmed_query,
        len(results),
    )
    return results


async def get_slide_at_index(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    index: int,
    *,
    include_full_content: bool = False,
) -> dict[str, Any] | None:
    slide = await sql_session.scalar(
        select(SlideModel).where(
            SlideModel.presentation == presentation_id,
            SlideModel.index == index,
        )
    )
    if not slide:
        LOGGER.info(
            "Chat memory miss for slide by index (presentation_id=%s, index=%d)",
            presentation_id,
            index,
        )
        return None

    response: dict[str, Any] = {
        "slide_id": str(slide.id),
        "index": slide.index,
        "slide_number": slide.index + 1,
        "layout_id": slide.layout,
        "content_preview": build_snippet(serialize_slide(slide), query_lower="", window=420),
        "speaker_note": slide.speaker_note,
    }
    if include_full_content:
        response["content"] = slide.content
    return response


async def get_available_layouts(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
) -> list[dict[str, Any]]:
    presentation = await load_presentation(sql_session, presentation_id)
    if not presentation or not isinstance(presentation.layout, dict):
        return []

    try:
        layout_model = presentation.get_layout()
    except Exception:
        LOGGER.exception(
            "Failed to parse presentation layout (presentation_id=%s)",
            presentation_id,
        )
        return []

    return [
        {"id": layout.id, "name": layout.name, "description": layout.description}
        for layout in layout_model.slides
    ]


async def get_content_schema_from_layout_id(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    layout_id: str,
) -> dict[str, Any] | None:
    layout = await get_layout_by_id(sql_session, presentation_id, layout_id)
    return layout.json_schema if layout else None


async def get_layout_by_id(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    layout_id: str,
    *,
    presentation: PresentationModel | None = None,
) -> SlideLayoutModel | None:
    if presentation is None:
        presentation = await load_presentation(sql_session, presentation_id)
    if not presentation or not isinstance(presentation.layout, dict):
        return None

    try:
        layout_model = presentation.get_layout()
    except Exception:
        return None

    for layout in layout_model.slides:
        if layout.id == layout_id:
            return layout
    return None
