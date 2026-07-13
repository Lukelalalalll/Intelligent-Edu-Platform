from __future__ import annotations

from functools import partial
from typing import Any, Awaitable, Callable

from llmai.shared import Tool  # type: ignore[import-not-found]

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.schemas import (
    DeleteSlideInput,
    GenerateAssetsInput,
    GetContentSchemaFromLayoutIdInput,
    GetSlideAtIndexInput,
    NoArgsInput,
    SaveSlideInput,
    SearchSlidesInput,
    SetPresentationThemeInput,
)
from services.chat.tools_support import asset_tools, query_tools, slide_mutation_tools, theme_tools

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


def build_tool_definitions() -> list[Tool]:
    return [
        Tool(
            name="getPresentationOutline",
            description=(
                "Live database: current deck structure. "
                "Use for the **actual** slide list/order and compact previews—not for uploaded PDF text or pre-outline RAG. "
                "Falls back to stored outlines only if no slide rows exist. "
                "Return compact sections (no full slide JSON). Use for flow, sections, or 'what slides exist'."
            ),
            schema=NoArgsInput,
            strict=True,
        ),
        Tool(
            name="searchSlides",
            description=(
                "Live SQL slides: keyword/semantic style search with snippets and indices. "
                "Use to find on-slide text, topics, or which slide mentioned something. "
                "For source-document-only questions, rely on deck memory; use this when the question is about **slides as built**. "
                "Always provide both query and limit."
            ),
            schema=SearchSlidesInput,
            strict=True,
        ),
        Tool(
            name="getSlideAtIndex",
            description=(
                "Live SQL: one slide by index—authoritative for exact current content. "
                "Set includeFullContent=true when you need full JSON (before saveSlide or precise edits). "
                "If user says slide N, use zero-based index N-1."
            ),
            schema=GetSlideAtIndexInput,
            strict=True,
        ),
        Tool(
            name="getPresentationThemeCatalog",
            description=(
                "Read-only theme catalog for the current presentation. "
                "Returns currently applied color theme and all available color themes "
                "(built-in + saved custom themes). "
                "Use this for questions like 'which theme is applied' or "
                "'what themes are available'. "
                "Do NOT use getAvailableLayouts for theme questions."
            ),
            schema=NoArgsInput,
            strict=True,
        ),
        Tool(
            name="getAvailableLayouts",
            description=(
                "List slide layout ids/descriptions for the presentation template. "
                "This is for content structure/layout selection only, not color themes."
            ),
            schema=NoArgsInput,
            strict=True,
        ),
        Tool(
            name="getContentSchemaFromLayoutId",
            description=(
                "Fetch the JSON content schema for a layout id. Use before "
                "saving slide content to validate structure."
            ),
            schema=GetContentSchemaFromLayoutIdInput,
            strict=True,
        ),
        Tool(
            name="generateAssets",
            description=(
                "Generate multiple media assets in one call. Use for all slide "
                "images and icons before saving content; include every needed "
                "asset in the assets array instead of calling image/icon tools "
                "one at a time."
            ),
            schema=GenerateAssetsInput,
            strict=True,
        ),
        Tool(
            name="saveSlide",
            description=(
                "Save slide content for a layout. If replaceOldSlideAtIndex is "
                "true, replace that index; otherwise insert as a new slide. "
                "Pass content as a JSON-serialized object string and the server "
                "will validate it against layout schema before save. "
                "Returns saved:false with validation_errors when limits are exceeded—"
                "typically shorten strings to satisfy maxLength, then call saveSlide again."
            ),
            schema=SaveSlideInput,
            strict=True,
        ),
        Tool(
            name="deleteSlide",
            description=(
                "Delete an existing slide by zero-based index and reindex the "
                "remaining slides. Use when the user asks to remove a slide."
            ),
            schema=DeleteSlideInput,
            strict=True,
        ),
        Tool(
            name="setPresentationTheme",
            description=(
                "Change the deck theme using user-friendly requests like "
                "'dark', 'light', theme name/id, or 'another'. "
                "Can also apply customTheme payloads with colors/fonts and "
                "optionally save them for reuse. Applies theme at presentation level. "
                "Only use this when the user explicitly asks to change/apply/switch theme."
            ),
            schema=SetPresentationThemeInput,
            strict=True,
        ),
    ]


def build_tool_handlers(memory: PresentationContextStore) -> dict[str, ToolHandler]:
    return {
        "getPresentationOutline": partial(query_tools.get_presentation_outline, memory),
        "searchSlides": partial(query_tools.search_slides, memory),
        "getSlideAtIndex": partial(query_tools.get_slide_at_index, memory),
        "getPresentationThemeCatalog": partial(
            query_tools.get_presentation_theme_catalog,
            memory,
        ),
        "getAvailableLayouts": partial(query_tools.get_available_layouts, memory),
        "getContentSchemaFromLayoutId": partial(
            query_tools.get_content_schema_from_layout_id,
            memory,
        ),
        "generateAssets": partial(asset_tools.generate_assets, memory),
        "generateImage": partial(asset_tools.generate_image, memory),
        "generateIcon": partial(asset_tools.generate_icon, memory),
        "saveSlide": partial(slide_mutation_tools.save_slide, memory),
        "deleteSlide": partial(slide_mutation_tools.delete_slide, memory),
        "setPresentationTheme": partial(theme_tools.set_presentation_theme, memory),
    }
