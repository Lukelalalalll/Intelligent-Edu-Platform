from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from backend.presenton_runtime_context import get_presenton_owner_user_id

from .runtime_bootstrap import ChatHistoryMessageModel, PresentationModel, SlideModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_owner_user_id(owner_user_id: str | None) -> str:
    explicit = str(owner_user_id or "").strip()
    if explicit:
        return explicit
    return get_presenton_owner_user_id()


def normalize_value(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value
    if isinstance(value, dict):
        return {str(key): normalize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize_value(item) for item in value]
    return value


def flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(
            fragment for fragment in (flatten_text(item) for item in value.values()) if fragment
        )
    if isinstance(value, (list, tuple, set)):
        return " ".join(
            fragment for fragment in (flatten_text(item) for item in value) if fragment
        )
    return str(value)


def require_owner_user_id(owner_user_id: str | None) -> str:
    resolved = normalize_owner_user_id(owner_user_id)
    if resolved:
        return resolved
    raise ValueError("PPT Generator projection requires a non-empty owner user id.")


def serialize_presentation(
    presentation: PresentationModel,
    *,
    owner_user_id: str,
    slide_count: int,
) -> dict[str, Any]:
    search_text = " ".join(
        fragment
        for fragment in [
            flatten_text(presentation.title),
            flatten_text(presentation.content),
            flatten_text(presentation.outlines),
            flatten_text(presentation.structure),
            flatten_text(presentation.instructions),
        ]
        if fragment
    ).strip()
    return {
        "presentonPresentationId": str(presentation.id),
        "ownerUserId": owner_user_id,
        "content": presentation.content,
        "nSlides": int(presentation.n_slides),
        "slideCount": int(slide_count),
        "language": presentation.language,
        "title": presentation.title,
        "filePaths": normalize_value(presentation.file_paths or []),
        "outlines": normalize_value(presentation.outlines),
        "layout": normalize_value(presentation.layout),
        "structure": normalize_value(presentation.structure),
        "instructions": presentation.instructions,
        "tone": presentation.tone,
        "verbosity": presentation.verbosity,
        "includeTableOfContents": bool(presentation.include_table_of_contents),
        "includeTitleSlide": bool(presentation.include_title_slide),
        "webSearch": bool(presentation.web_search),
        "theme": normalize_value(presentation.theme),
        "searchText": search_text,
        "createdAt": presentation.created_at,
        "updatedAt": presentation.updated_at,
        "syncedAt": utcnow(),
        "syncSource": "presenton_sqlite",
    }


def serialize_slide(
    slide: SlideModel,
    *,
    owner_user_id: str,
) -> dict[str, Any]:
    content_text = flatten_text(slide.content).strip()
    search_text = " ".join(
        fragment
        for fragment in [
            content_text,
            flatten_text(slide.html_content),
            flatten_text(slide.speaker_note),
        ]
        if fragment
    ).strip()
    return {
        "presentonPresentationId": str(slide.presentation),
        "ownerUserId": owner_user_id,
        "slideId": str(slide.id),
        "layoutGroup": slide.layout_group,
        "layout": slide.layout,
        "index": int(slide.index),
        "content": normalize_value(slide.content),
        "contentText": content_text,
        "htmlContent": slide.html_content,
        "speakerNote": slide.speaker_note,
        "properties": normalize_value(slide.properties),
        "searchText": search_text,
        "syncedAt": utcnow(),
        "syncSource": "presenton_sqlite",
    }


def serialize_chat_message(
    message: ChatHistoryMessageModel,
    *,
    owner_user_id: str,
) -> dict[str, Any]:
    return {
        "presentonPresentationId": str(message.presentation_id),
        "ownerUserId": owner_user_id,
        "messageId": str(message.id),
        "conversationId": str(message.conversation_id),
        "position": int(message.position),
        "role": message.role,
        "content": message.content,
        "toolCalls": normalize_value(message.tool_calls or []),
        "createdAt": message.created_at,
        "syncedAt": utcnow(),
        "syncSource": "presenton_sqlite",
    }
