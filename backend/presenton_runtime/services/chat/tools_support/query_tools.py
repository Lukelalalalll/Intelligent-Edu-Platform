from __future__ import annotations

from typing import Any

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import (
    GetContentSchemaFromLayoutIdInput,
    GetSlideAtIndexInput,
    SearchSlidesInput,
)
from services.chat.tools_support.parsing import normalize_slide_lookup_args
from services.chat.tools_support.response_helpers import build_outline_response


async def get_presentation_outline(
    memory: PresentationContextStore,
    _: dict[str, Any],
) -> dict[str, Any]:
    return build_outline_response(await memory.get("presentation_outline"))


async def search_slides(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = SearchSlidesInput(**args)
    results = await memory.search(payload.query, payload.limit)
    return {
        "query": payload.query,
        "count": len(results),
        "results": results,
    }


async def get_slide_at_index(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = GetSlideAtIndexInput(**normalize_slide_lookup_args(args))
    slide = await memory.get_slide_at_index(
        payload.index,
        include_full_content=payload.include_full_content,
    )
    if not slide and payload.index > 0:
        fallback_index = payload.index - 1
        fallback_slide = await memory.get_slide_at_index(
            fallback_index,
            include_full_content=payload.include_full_content,
        )
        if fallback_slide:
            return {
                "found": True,
                "slide": fallback_slide,
                "requested_index": payload.index,
                "resolved_index": fallback_index,
                "note": (
                    "No slide found at requested index; returned one-based fallback "
                    f"at index {fallback_index}."
                ),
            }
    if not slide:
        return {
            "found": False,
            "message": f"No slide found at index {payload.index}.",
        }
    return {
        "found": True,
        "slide": slide,
    }


async def get_available_layouts(
    memory: PresentationContextStore,
    _: dict[str, Any],
) -> dict[str, Any]:
    layouts = await memory.get_available_layouts()
    return {
        "count": len(layouts),
        "layouts": layouts,
    }


async def get_presentation_theme_catalog(
    memory: PresentationContextStore,
    _: dict[str, Any],
) -> dict[str, Any]:
    return await memory.get_presentation_theme_catalog()


async def get_content_schema_from_layout_id(
    memory: PresentationContextStore,
    args: dict[str, Any],
) -> dict[str, Any]:
    payload = GetContentSchemaFromLayoutIdInput(**args)
    schema = await memory.get_content_schema_from_layout_id(payload.layout_id)
    if schema is None:
        return {
            "found": False,
            "layout_id": payload.layout_id,
            "message": "Layout schema not found for the provided layout id.",
        }
    return {
        "found": True,
        "layout_id": payload.layout_id,
        "content_schema": schema,
    }
