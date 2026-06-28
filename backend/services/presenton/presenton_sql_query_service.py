from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select

from .presenton_projection.runtime_bootstrap import (
    ChatHistoryMessageModel,
    PresentationModel,
    SlideModel,
    get_async_session_maker,
)

from services.search_indexing import build_slide_content_text


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize_value(item) for key, item in value.items()}
    return value


def _normalize_owner_user_id(owner_user_id: str) -> str:
    return str(owner_user_id or "").strip()


def _normalize_search_query(query: str) -> str:
    return " ".join(str(query or "").split()).strip()


def _slide_content_text(slide: SlideModel) -> str:
    return build_slide_content_text(slide.content or {})


def _serialize_presentation_summary(presentation: PresentationModel) -> dict[str, Any]:
    created_at = _serialize_value(presentation.created_at)
    updated_at = _serialize_value(presentation.updated_at)
    return {
        "presentonPresentationId": str(presentation.id),
        "ownerUserId": str(presentation.owner_user_id or ""),
        "title": str(presentation.title or ""),
        "language": str(presentation.language or ""),
        "nSlides": int(presentation.n_slides or 0),
        "slideCount": int(presentation.n_slides or 0),
        "theme": _serialize_value(presentation.theme),
        "filePaths": _serialize_value(presentation.file_paths or []),
        "createdAt": created_at,
        "updatedAt": updated_at,
        "syncedAt": updated_at,
        "syncSource": "presenton_sql",
    }


def _serialize_presentation_detail(presentation: PresentationModel) -> dict[str, Any]:
    payload = _serialize_presentation_summary(presentation)
    payload["content"] = str(presentation.content or "")
    payload["outlines"] = _serialize_value(presentation.outlines)
    payload["layout"] = _serialize_value(presentation.layout)
    payload["structure"] = _serialize_value(presentation.structure)
    payload["instructions"] = presentation.instructions
    payload["tone"] = presentation.tone
    payload["verbosity"] = presentation.verbosity
    payload["includeTableOfContents"] = bool(presentation.include_table_of_contents)
    payload["includeTitleSlide"] = bool(presentation.include_title_slide)
    payload["webSearch"] = bool(presentation.web_search)
    return payload


def _serialize_slide_detail(slide: SlideModel, *, owner_user_id: str) -> dict[str, Any]:
    synced_at = None
    return {
        "slideId": str(slide.id),
        "presentonPresentationId": str(slide.presentation),
        "ownerUserId": owner_user_id,
        "index": int(slide.index or 0),
        "layoutGroup": str(slide.layout_group or ""),
        "layout": str(slide.layout or ""),
        "content": _serialize_value(slide.content or {}),
        "contentText": _slide_content_text(slide),
        "speakerNote": str(slide.speaker_note or ""),
        "htmlContent": slide.html_content,
        "properties": _serialize_value(slide.properties),
        "syncedAt": synced_at,
        "syncSource": "presenton_sql",
    }


def _serialize_chat_detail(message: ChatHistoryMessageModel, *, owner_user_id: str) -> dict[str, Any]:
    created_at = _serialize_value(message.created_at)
    return {
        "messageId": str(message.id),
        "presentonPresentationId": str(message.presentation_id),
        "ownerUserId": owner_user_id,
        "conversationId": str(message.conversation_id),
        "position": int(message.position or 0),
        "role": str(message.role or ""),
        "content": str(message.content or ""),
        "createdAt": created_at,
        "toolCalls": _serialize_value(message.tool_calls),
        "syncedAt": created_at,
        "syncSource": "presenton_sql",
    }


def _build_slide_match_preview(slides: list[SlideModel]) -> list[dict[str, Any]]:
    previews: list[dict[str, Any]] = []
    for slide in slides:
        previews.append(
            {
                "index": int(slide.index or 0),
                "contentText": _slide_content_text(slide),
                "speakerNote": str(slide.speaker_note or ""),
            }
        )
    return previews


def _build_search_clause(model, query: str, dialect_name: str):
    if dialect_name == "postgresql":
        return func.to_tsvector("simple", func.coalesce(model.search_text, "")).op("@@")(
            func.plainto_tsquery("simple", query)
        )
    return model.search_text.ilike(f"%{query}%")


class PresentonSqlQueryService:
    async def list_presentations(
        self,
        *,
        owner_user_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        owner_id = _normalize_owner_user_id(owner_user_id)
        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(100, int(page_size or 20)))
        skip = (safe_page - 1) * safe_page_size

        async_session_maker = get_async_session_maker()
        async with async_session_maker() as session:
            query = select(PresentationModel).where(PresentationModel.owner_user_id == owner_id)
            total = int(
                await session.scalar(
                    select(func.count()).select_from(query.subquery())
                )
                or 0
            )
            presentations = list(
                (
                    await session.scalars(
                        query.order_by(PresentationModel.updated_at.desc())
                        .offset(skip)
                        .limit(safe_page_size)
                    )
                ).all()
            )
            return [_serialize_presentation_summary(item) for item in presentations], total

    async def get_presentation_detail(
        self,
        *,
        owner_user_id: str,
        presentation_id: str,
    ) -> dict[str, Any] | None:
        owner_id = _normalize_owner_user_id(owner_user_id)
        try:
            presentation_uuid = uuid.UUID(str(presentation_id))
        except Exception:
            return None

        async_session_maker = get_async_session_maker()
        async with async_session_maker() as session:
            presentation = await session.scalar(
                select(PresentationModel).where(
                    PresentationModel.id == presentation_uuid,
                    PresentationModel.owner_user_id == owner_id,
                )
            )
            if not presentation:
                return None

            slides = list(
                (
                    await session.scalars(
                        select(SlideModel)
                        .where(SlideModel.presentation == presentation_uuid)
                        .order_by(SlideModel.index.asc())
                    )
                ).all()
            )
            messages = list(
                (
                    await session.scalars(
                        select(ChatHistoryMessageModel)
                        .where(ChatHistoryMessageModel.presentation_id == presentation_uuid)
                        .order_by(
                            ChatHistoryMessageModel.conversation_id.asc(),
                            ChatHistoryMessageModel.position.asc(),
                        )
                    )
                ).all()
            )

        conversations_by_id: dict[str, dict[str, Any]] = {}
        for message in messages:
            serialized = _serialize_chat_detail(message, owner_user_id=owner_id)
            conversation_key = serialized["conversationId"]
            bucket = conversations_by_id.setdefault(
                conversation_key,
                {
                    "conversationId": conversation_key,
                    "messageCount": 0,
                    "createdAt": serialized.get("createdAt"),
                    "lastMessageAt": serialized.get("createdAt"),
                    "messages": [],
                },
            )
            bucket["messages"].append(serialized)
            bucket["messageCount"] += 1
            bucket["lastMessageAt"] = serialized.get("createdAt")

        conversations = list(conversations_by_id.values())
        conversations.sort(key=lambda item: str(item.get("lastMessageAt") or ""), reverse=True)

        return {
            "presentation": _serialize_presentation_detail(presentation),
            "slides": [_serialize_slide_detail(slide, owner_user_id=owner_id) for slide in slides],
            "chatConversations": conversations,
            "chatSummary": {
                "conversationCount": len(conversations),
                "messageCount": len(messages),
            },
        }

    async def search_presentations(
        self,
        *,
        owner_user_id: str,
        query: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        owner_id = _normalize_owner_user_id(owner_user_id)
        normalized_query = _normalize_search_query(query)
        if not normalized_query:
            return await self.list_presentations(
                owner_user_id=owner_id,
                page=page,
                page_size=page_size,
            )

        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(100, int(page_size or 20)))
        skip = (safe_page - 1) * safe_page_size

        async_session_maker = get_async_session_maker()
        async with async_session_maker() as session:
            dialect_name = session.bind.dialect.name if session.bind is not None else ""
            presentation_match = _build_search_clause(PresentationModel, normalized_query, dialect_name)
            slide_match = _build_search_clause(SlideModel, normalized_query, dialect_name)

            presentation_ids = list(
                (
                    await session.scalars(
                        select(PresentationModel.id).where(
                            PresentationModel.owner_user_id == owner_id,
                            presentation_match,
                        )
                    )
                ).all()
            )
            slide_ids = list(
                (
                    await session.scalars(
                        select(SlideModel.presentation).join(
                            PresentationModel,
                            PresentationModel.id == SlideModel.presentation,
                        ).where(
                            PresentationModel.owner_user_id == owner_id,
                            slide_match,
                        )
                    )
                ).all()
            )

            ordered_ids: list[uuid.UUID] = []
            for candidate in [*presentation_ids, *slide_ids]:
                if candidate not in ordered_ids:
                    ordered_ids.append(candidate)
            if not ordered_ids:
                return [], 0

            presentations = list(
                (
                    await session.scalars(
                        select(PresentationModel)
                        .where(PresentationModel.id.in_(ordered_ids))
                        .order_by(PresentationModel.updated_at.desc())
                    )
                ).all()
            )
            total = len(presentations)
            page_presentations = presentations[skip : skip + safe_page_size]

            slide_matches = list(
                (
                    await session.scalars(
                        select(SlideModel)
                        .join(PresentationModel, PresentationModel.id == SlideModel.presentation)
                        .where(
                            PresentationModel.owner_user_id == owner_id,
                            SlideModel.presentation.in_([item.id for item in page_presentations] or [uuid.uuid4()]),
                            slide_match,
                        )
                        .order_by(SlideModel.presentation.asc(), SlideModel.index.asc())
                    )
                ).all()
            )

        slide_matches_by_presentation: dict[str, list[SlideModel]] = {}
        for slide in slide_matches:
            slide_matches_by_presentation.setdefault(str(slide.presentation), []).append(slide)

        items: list[dict[str, Any]] = []
        for presentation in page_presentations:
            presentation_id = str(presentation.id)
            summary = _serialize_presentation_summary(presentation)
            matched_slides = _build_slide_match_preview(
                slide_matches_by_presentation.get(presentation_id, [])
            )
            summary["matchedSlides"] = matched_slides
            summary["matchedSlidesCount"] = len(matched_slides)
            items.append(summary)
        return items, total


PRESENTON_SQL_QUERY_SERVICE = PresentonSqlQueryService()
