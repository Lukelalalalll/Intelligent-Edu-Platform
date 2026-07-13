from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from llmai.shared import AssistantMessage, Message, SystemMessage, UserMessage  # type: ignore[import-not-found]

from models.sql.presentation import PresentationModel
from services.chat.prompts import build_system_prompt


def strip_ui_context_prefix(user_message: str) -> str:
    marker = "\nUser message:"
    if not user_message.startswith("UI context:"):
        return user_message
    marker_index = user_message.find(marker)
    if marker_index == -1:
        return user_message
    return user_message[marker_index + len(marker) :].lstrip()


def convert_history_to_messages(history: list[dict[str, str]]) -> list[Message]:
    messages: list[Message] = []
    for item in history:
        role = item.get("role")
        content = item.get("content")
        if not content:
            continue
        if role == "user":
            messages.append(UserMessage(content=strip_ui_context_prefix(content)))
        elif role == "assistant":
            messages.append(AssistantMessage(content=[content]))
    return messages


async def prepare_turn_context(
    *,
    sql_session,
    presentation_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    conversation_store,
    memory,
    user_message: str,
) -> tuple[uuid.UUID, list[Message]]:
    if not (user_message or "").strip():
        raise HTTPException(status_code=400, detail="Message is required")

    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    resolved_conversation_id = await conversation_store.ensure_conversation_id(conversation_id)
    history = await conversation_store.load_history(
        presentation_id=presentation_id,
        conversation_id=resolved_conversation_id,
    )
    normalized_user_message = strip_ui_context_prefix(user_message)
    memory_query = normalized_user_message or user_message
    presentation_memory = await memory.retrieve_context(memory_query)
    chat_memory = await conversation_store.retrieve_semantic_context(
        presentation_id=presentation_id,
        conversation_id=resolved_conversation_id,
        query=memory_query,
    )
    messages: list[Message] = [
        SystemMessage(
            content=build_system_prompt(
                presentation_memory_context=presentation_memory,
                chat_memory_context=chat_memory,
            )
        ),
        *convert_history_to_messages(history),
        UserMessage(content=user_message),
    ]
    return resolved_conversation_id, messages
