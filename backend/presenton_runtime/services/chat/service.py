from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from services.chat.conversation_store import ChatConversationStore
from services.chat.presentation_context_store import PresentationContextStore
from services.chat.service_support import (
    ChatLlmOrchestrator,
    ChatStreamEventType,
    ChatStreamEventValue,
    ChatTurnResult,
    persist_turn,
    prepare_turn_context,
)
from services.chat.tools import ChatTools


class PresentationChatService:
    def __init__(
        self,
        sql_session: AsyncSession,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
    ):
        self._sql_session = sql_session
        self._presentation_id = presentation_id
        self._conversation_id = conversation_id
        self._conversation_store = ChatConversationStore(sql_session)
        self._memory = PresentationContextStore(sql_session, presentation_id)
        self._tools = ChatTools(self._memory)
        self._orchestrator = ChatLlmOrchestrator(self._tools)

    async def generate_reply(self, user_message: str) -> ChatTurnResult:
        conversation_id, messages = await prepare_turn_context(
            sql_session=self._sql_session,
            presentation_id=self._presentation_id,
            conversation_id=self._conversation_id,
            conversation_store=self._conversation_store,
            memory=self._memory,
            user_message=user_message,
        )
        response_text, tool_calls = await self._orchestrator.run_llm_with_tools(messages)
        return await persist_turn(
            sql_session=self._sql_session,
            presentation_id=self._presentation_id,
            conversation_id=conversation_id,
            conversation_store=self._conversation_store,
            user_message=user_message,
            response_text=response_text,
            tool_calls=tool_calls,
        )

    async def stream_reply(
        self,
        user_message: str,
    ) -> AsyncGenerator[tuple[ChatStreamEventType, ChatStreamEventValue], None]:
        yield "status", "Reading deck context"
        conversation_id, messages = await prepare_turn_context(
            sql_session=self._sql_session,
            presentation_id=self._presentation_id,
            conversation_id=self._conversation_id,
            conversation_store=self._conversation_store,
            memory=self._memory,
            user_message=user_message,
        )

        stream_run = self._orchestrator.build_stream_run(messages)
        async for event_type, value in stream_run.iterate():
            yield event_type, value

        yield "status", "Saving chat"
        result = await persist_turn(
            sql_session=self._sql_session,
            presentation_id=self._presentation_id,
            conversation_id=conversation_id,
            conversation_store=self._conversation_store,
            user_message=user_message,
            response_text=stream_run.response_text
            or "I could not generate a response for that request.",
            tool_calls=stream_run.called_tools,
        )
        yield "complete", result
