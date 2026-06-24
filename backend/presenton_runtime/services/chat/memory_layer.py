from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from services.chat.memory_layer_support.chat_memory_assets import (
    generate_icon,
    generate_image,
)
from services.chat.memory_layer_support.chat_memory_queries import (
    get_available_layouts,
    get_content_schema_from_layout_id,
    get_outline,
    get_slide_at_index,
    search_slides,
)
from services.chat.memory_layer_support.chat_memory_slide_ops import (
    delete_slide,
    save_slide,
)
from services.chat.memory_layer_support.chat_memory_themes import (
    get_presentation_theme_catalog,
    set_presentation_theme,
)
from services.mem0_presentation_memory_service import MEM0_PRESENTATION_MEMORY_SERVICE

LOGGER = logging.getLogger(__name__)


class PresentationChatMemoryLayer:
    """
    Memory abstraction for chat tools and context retrieval.

    This layer intentionally hides where data comes from (SQL-backed persisted state
    and mem0 retrieval) behind `get` and `search`-style methods so chat logic stays
    decoupled from storage details.
    """

    def __init__(self, sql_session: AsyncSession, presentation_id: uuid.UUID):
        self._sql_session = sql_session
        self._presentation_id = presentation_id

    async def get(self, key: str) -> Any:
        if key != "presentation_outline":
            return None
        return await get_outline(self._sql_session, self._presentation_id)

    async def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        return await search_slides(self._sql_session, self._presentation_id, query, limit)

    async def get_slide_at_index(
        self,
        index: int,
        *,
        include_full_content: bool = False,
    ) -> dict[str, Any] | None:
        return await get_slide_at_index(
            self._sql_session,
            self._presentation_id,
            index,
            include_full_content=include_full_content,
        )

    async def get_available_layouts(self) -> list[dict[str, Any]]:
        return await get_available_layouts(self._sql_session, self._presentation_id)

    async def get_content_schema_from_layout_id(
        self,
        layout_id: str,
    ) -> dict[str, Any] | None:
        return await get_content_schema_from_layout_id(
            self._sql_session,
            self._presentation_id,
            layout_id,
        )

    async def generate_image(self, prompt: str) -> str:
        return await generate_image(self._sql_session, prompt)

    async def generate_icon(self, query: str) -> str:
        return await generate_icon(self._sql_session, self._presentation_id, query)

    async def save_slide(
        self,
        *,
        content: dict[str, Any],
        layout_id: str,
        index: int,
        replace_old_slide_at_index: bool,
    ) -> dict[str, Any]:
        return await save_slide(
            self._sql_session,
            self._presentation_id,
            content=content,
            layout_id=layout_id,
            index=index,
            replace_old_slide_at_index=replace_old_slide_at_index,
        )

    async def delete_slide(self, *, index: int) -> dict[str, Any]:
        return await delete_slide(self._sql_session, self._presentation_id, index=index)

    async def set_presentation_theme(
        self,
        *,
        theme_query: str | None = None,
        custom_theme: dict[str, Any] | None = None,
        save_custom_theme: bool = True,
    ) -> dict[str, Any]:
        return await set_presentation_theme(
            self._sql_session,
            self._presentation_id,
            theme_query=theme_query,
            custom_theme=custom_theme,
            save_custom_theme=save_custom_theme,
        )

    async def get_presentation_theme_catalog(self) -> dict[str, Any]:
        return await get_presentation_theme_catalog(
            self._sql_session,
            self._presentation_id,
        )

    async def retrieve_context(self, query: str) -> str:
        context = await MEM0_PRESENTATION_MEMORY_SERVICE.retrieve_context(
            self._presentation_id,
            query,
        )
        if context:
            LOGGER.info(
                "Chat memory semantic context hit (presentation_id=%s, chars=%d)",
                self._presentation_id,
                len(context),
            )
        else:
            LOGGER.info(
                "Chat memory semantic context miss (presentation_id=%s)",
                self._presentation_id,
            )
        return context
