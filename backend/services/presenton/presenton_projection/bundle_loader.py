from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from .runtime_bootstrap import ChatHistoryMessageModel, PresentationModel, SlideModel


@dataclass(frozen=True)
class PresentonProjectionBundle:
    presentation: PresentationModel
    slides: list[SlideModel]


async def load_presentation_bundle(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
) -> PresentonProjectionBundle:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise ValueError(f"Presentation not found: {presentation_id}")

    slides_result = await sql_session.scalars(
        select(SlideModel)
        .where(SlideModel.presentation == presentation_id)
        .order_by(SlideModel.index.asc())
    )
    return PresentonProjectionBundle(presentation=presentation, slides=list(slides_result))


async def load_chat_messages(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    conversation_id: uuid.UUID,
) -> list[ChatHistoryMessageModel]:
    rows = await sql_session.scalars(
        select(ChatHistoryMessageModel)
        .where(
            ChatHistoryMessageModel.presentation_id == presentation_id,
            ChatHistoryMessageModel.conversation_id == conversation_id,
        )
        .order_by(ChatHistoryMessageModel.position.asc())
    )
    return list(rows)
