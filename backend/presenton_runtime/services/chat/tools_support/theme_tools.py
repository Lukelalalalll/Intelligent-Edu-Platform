from __future__ import annotations

from typing import Any

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import SetPresentationThemeInput


async def set_presentation_theme(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = SetPresentationThemeInput(**args)
    return await memory.set_presentation_theme(
        theme_query=payload.theme,
        custom_theme=(
            payload.custom_theme.model_dump(exclude_none=True)
            if payload.custom_theme is not None
            else None
        ),
        save_custom_theme=bool(payload.save_custom_theme),
    )
