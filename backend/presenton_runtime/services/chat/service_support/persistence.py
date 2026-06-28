from __future__ import annotations

import uuid

from .context import strip_ui_context_prefix
from .models import ChatTurnResult


async def persist_turn(
    *,
    sql_session,
    presentation_id: uuid.UUID,
    conversation_id: uuid.UUID,
    conversation_store,
    user_message: str,
    response_text: str,
    tool_calls: list[str],
) -> ChatTurnResult:
    await conversation_store.append_turn(
        presentation_id=presentation_id,
        conversation_id=conversation_id,
        user_message=strip_ui_context_prefix(user_message) or user_message,
        assistant_message=response_text,
        tool_calls=tool_calls,
    )
    await sql_session.commit()

    return ChatTurnResult(
        conversation_id=conversation_id,
        response_text=response_text,
        tool_calls=tool_calls,
    )
