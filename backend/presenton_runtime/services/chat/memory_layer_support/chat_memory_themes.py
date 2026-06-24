from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.services.presenton.presenton_projection_service import (
    PRESENTON_MONGO_PROJECTION_SERVICE,
)
from models.sql.key_value import KeyValueSqlModel
from models.sql.presentation import PresentationModel
from services.chat.memory_layer_support.chat_memory_theme_customization import (
    build_custom_theme_from_payload,
    find_theme_by_id,
    select_theme_for_query,
)
from services.chat.memory_layer_support.chat_memory_formatting import (
    extract_theme_name,
    is_dark_theme,
)
from services.chat.memory_layer_support.chat_memory_theme_data import (
    CHAT_BUILTIN_THEMES,
    THEMES_STORAGE_KEY,
)

LOGGER = logging.getLogger(__name__)


async def set_presentation_theme(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    *,
    theme_query: str | None = None,
    custom_theme: dict[str, Any] | None = None,
    save_custom_theme: bool = True,
) -> dict[str, Any]:
    requested_theme = (theme_query or "").strip()
    has_custom_theme = isinstance(custom_theme, dict)
    if not requested_theme and not has_custom_theme:
        return {
            "applied": False,
            "message": "Theme query or custom theme payload is required.",
        }

    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        return {"applied": False, "message": "Presentation not found."}

    current_theme = presentation.theme if isinstance(presentation.theme, dict) else None
    available_themes = await get_chat_available_themes(sql_session)
    selected_theme: dict[str, Any] | None = None
    custom_theme_saved = False
    selected_source = "query"

    if has_custom_theme:
        selected_theme = build_custom_theme_from_payload(
            custom_theme=custom_theme or {},
            requested_theme=requested_theme,
            current_theme=current_theme,
            available_themes=available_themes,
        )
        if not selected_theme:
            return {
                "applied": False,
                "message": (
                    "Invalid custom theme payload. Include colors and optional font "
                    "details (name/url), or use a theme name/id query."
                ),
                "requested_theme": requested_theme or None,
            }
        selected_source = "custom"
        if save_custom_theme:
            await upsert_custom_theme_in_store(sql_session, selected_theme)
            custom_theme_saved = True
    else:
        selected_theme = select_theme_for_query(
            requested_theme,
            available_themes,
            current_theme,
        )

    if not selected_theme:
        return {
            "applied": False,
            "message": (
                "No matching theme found. Try a specific theme name/id, "
                "use 'dark'/'light'/'another', or provide customTheme."
            ),
            "requested_theme": requested_theme,
            "available_themes": [
                {"id": str(theme.get("id") or ""), "name": str(theme.get("name") or "")}
                for theme in available_themes
            ],
        }

    previous_theme = copy.deepcopy(current_theme) if current_theme else None
    presentation.theme = copy.deepcopy(selected_theme)
    sql_session.add(presentation)
    await sql_session.commit()
    await PRESENTON_MONGO_PROJECTION_SERVICE.safe_sync_presentation_bundle(
        sql_session,
        presentation_id=presentation_id,
        reason="chat_set_presentation_theme",
    )
    selected_name = str(selected_theme.get("name") or "selected theme")
    return {
        "applied": True,
        "message": f"Theme changed to '{selected_name}'.",
        "requested_theme": requested_theme or None,
        "theme": selected_theme,
        "theme_id": str(selected_theme.get("id") or ""),
        "theme_name": selected_name,
        "theme_source": selected_source,
        "custom_theme_saved": custom_theme_saved,
        "previous_theme_name": extract_theme_name(previous_theme),
    }


async def get_presentation_theme_catalog(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
) -> dict[str, Any]:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        return {
            "found": False,
            "message": "Presentation not found.",
            "current_theme": None,
            "available_themes": [],
            "count": 0,
        }

    current_theme = (
        copy.deepcopy(presentation.theme) if isinstance(presentation.theme, dict) else None
    )
    current_theme_id = (
        str((current_theme or {}).get("id") or "").strip().lower() if current_theme else ""
    )
    builtin_theme_ids = {
        str(theme.get("id") or "").strip().lower() for theme in CHAT_BUILTIN_THEMES
    }
    available_themes = await get_chat_available_themes(sql_session)

    catalog: list[dict[str, Any]] = []
    for theme in available_themes:
        theme_id = str(theme.get("id") or "").strip()
        theme_name = str(theme.get("name") or "").strip()
        if not theme_id and not theme_name:
            continue
        normalized_theme_id = theme_id.lower()
        catalog.append(
            {
                "id": theme_id,
                "name": theme_name or theme_id,
                "description": str(theme.get("description") or "").strip(),
                "source": "built_in" if normalized_theme_id in builtin_theme_ids else "custom",
                "is_current": bool(
                    current_theme_id
                    and normalized_theme_id
                    and normalized_theme_id == current_theme_id
                ),
            }
        )

    current_theme_summary = None
    if current_theme:
        current_theme_summary = {
            "id": str(current_theme.get("id") or "").strip(),
            "name": str(current_theme.get("name") or "").strip(),
            "description": str(current_theme.get("description") or "").strip(),
        }
    return {
        "found": True,
        "count": len(catalog),
        "current_theme": current_theme_summary,
        "available_themes": catalog,
        "available_theme_ids": [theme["id"] for theme in catalog if theme.get("id")],
        "message": "Theme catalog fetched successfully.",
    }


async def get_chat_available_themes(
    sql_session: AsyncSession,
) -> list[dict[str, Any]]:
    merged_themes = [copy.deepcopy(theme) for theme in CHAT_BUILTIN_THEMES]
    row = await sql_session.scalar(
        select(KeyValueSqlModel).where(KeyValueSqlModel.key == THEMES_STORAGE_KEY)
    )
    if not row or not isinstance(row.value, dict):
        return merged_themes

    custom_themes = row.value.get("themes")
    if not isinstance(custom_themes, list):
        return merged_themes

    existing_ids = {str(theme.get("id") or "").strip().lower() for theme in merged_themes}
    for custom_theme in custom_themes:
        if not isinstance(custom_theme, dict):
            continue
        theme_data = custom_theme.get("data")
        colors = theme_data.get("colors") if isinstance(theme_data, dict) else None
        if not isinstance(colors, dict) or "background" not in colors:
            continue

        custom_theme_copy = copy.deepcopy(custom_theme)
        custom_theme_copy.setdefault("user", "local")
        theme_id = str(custom_theme_copy.get("id") or "").strip().lower()
        if theme_id and theme_id in existing_ids:
            continue
        if theme_id:
            existing_ids.add(theme_id)
        merged_themes.append(custom_theme_copy)
    return merged_themes


async def upsert_custom_theme_in_store(
    sql_session: AsyncSession,
    theme: dict[str, Any],
) -> None:
    row = await sql_session.scalar(
        select(KeyValueSqlModel).where(KeyValueSqlModel.key == THEMES_STORAGE_KEY)
    )
    themes: list[dict[str, Any]] = []
    if row and isinstance(row.value, dict):
        raw_themes = row.value.get("themes")
        if isinstance(raw_themes, list):
            themes = copy.deepcopy(raw_themes)

    theme_id = str(theme.get("id") or "").strip().lower()
    if theme_id:
        for idx, existing_theme in enumerate(themes):
            existing_id = str(existing_theme.get("id") or "").strip().lower()
            if existing_id == theme_id:
                themes[idx] = copy.deepcopy(theme)
                break
        else:
            themes.append(copy.deepcopy(theme))
    else:
        themes.append(copy.deepcopy(theme))

    if row:
        row.value = {"themes": themes}
        sql_session.add(row)
        return
    sql_session.add(KeyValueSqlModel(key=THEMES_STORAGE_KEY, value={"themes": themes}))
