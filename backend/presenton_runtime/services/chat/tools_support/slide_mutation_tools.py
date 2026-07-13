from __future__ import annotations

from typing import Any

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import DeleteSlideInput, SaveSlideInput
from services.chat.tools_support.parsing import normalize_save_slide_args, parse_slide_content


async def save_slide(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = SaveSlideInput(**normalize_save_slide_args(args))
    content_payload = parse_slide_content(payload.content)
    return await memory.save_slide(
        content=content_payload,
        layout_id=payload.layout_id,
        index=payload.index,
        replace_old_slide_at_index=payload.replace_old_slide_at_index,
    )


async def delete_slide(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = DeleteSlideInput(**args)
    return await memory.delete_slide(index=payload.index)
