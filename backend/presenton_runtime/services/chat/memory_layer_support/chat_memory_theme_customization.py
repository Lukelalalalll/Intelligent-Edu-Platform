from __future__ import annotations

import copy
import uuid
from typing import Any

from services.chat.memory_layer_support.chat_memory_formatting import (
    is_dark_theme,
    normalize_hex_color,
    sanitize_theme_id,
)
from services.chat.memory_layer_support.chat_memory_theme_data import (
    DEFAULT_THEME_FONT,
    THEME_COLOR_KEYS,
)


def build_custom_theme_from_payload(
    *,
    custom_theme: dict[str, Any],
    requested_theme: str,
    current_theme: dict[str, Any] | None,
    available_themes: list[dict[str, Any]],
) -> dict[str, Any] | None:
    base_theme = resolve_base_theme_for_customization(current_theme, available_themes)
    payload = copy.deepcopy(custom_theme)
    data_block = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(data_block, dict):
        return None

    colors_override = extract_colors_from_payload(data_block)
    if not colors_override:
        return None

    merged_colors = merge_theme_colors(base_theme=base_theme, color_overrides=colors_override)
    if not merged_colors:
        return None

    text_font = extract_text_font_from_payload(data_block, base_theme)
    if not text_font:
        return None

    name_candidates = [
        payload.get("name"),
        data_block.get("name"),
        requested_theme,
        "Custom Theme",
    ]
    theme_name = next(
        (
            str(candidate).strip()
            for candidate in name_candidates
            if isinstance(candidate, str) and str(candidate).strip()
        ),
        "Custom Theme",
    )
    theme_id = sanitize_theme_id(str(payload.get("id") or ""))
    if not theme_id:
        theme_id = sanitize_theme_id(theme_name)
    if not theme_id:
        theme_id = f"chat-custom-{uuid.uuid4().hex[:8]}"

    description = str(
        payload.get("description")
        or data_block.get("description")
        or f"Custom theme generated from chat request: {theme_name}"
    ).strip()
    theme_data = payload.get("data")
    final_data = copy.deepcopy(theme_data) if isinstance(theme_data, dict) else {}
    final_data["colors"] = merged_colors
    final_data["fonts"] = {"textFont": text_font}
    return {
        "id": theme_id,
        "name": theme_name,
        "description": description,
        "user": str(payload.get("user") or "local"),
        "logo": payload.get("logo"),
        "logo_url": payload.get("logo_url"),
        "company_name": payload.get("company_name"),
        "data": final_data,
    }


def resolve_base_theme_for_customization(
    current_theme: dict[str, Any] | None,
    available_themes: list[dict[str, Any]],
) -> dict[str, Any]:
    if isinstance(current_theme, dict):
        data = current_theme.get("data")
        colors = data.get("colors") if isinstance(data, dict) else None
        if isinstance(colors, dict):
            return copy.deepcopy(current_theme)

    preferred_base = find_theme_by_id(available_themes, "professional-blue")
    if preferred_base:
        return copy.deepcopy(preferred_base)
    if available_themes:
        return copy.deepcopy(available_themes[0])
    return {
        "id": "professional-blue",
        "name": "Professional Blue",
        "description": "Fallback base theme.",
        "user": "system",
        "logo": None,
        "logo_url": None,
        "company_name": None,
        "data": {
            "colors": {
                "primary": "#161616",
                "background": "#ffffff",
                "card": "#dae6ff",
                "stroke": "#d1d1d1",
                "primary_text": "#eeeaea",
                "background_text": "#000000",
                "graph_0": "#2e2e2e",
                "graph_1": "#424242",
                "graph_2": "#585858",
                "graph_3": "#6f6f6f",
                "graph_4": "#868686",
                "graph_5": "#9e9e9e",
                "graph_6": "#b7b7b7",
                "graph_7": "#d1d1d1",
                "graph_8": "#e8e8e8",
                "graph_9": "#f5f5f5",
            },
            "fonts": {"textFont": DEFAULT_THEME_FONT},
        },
    }


def extract_colors_from_payload(data_block: dict[str, Any]) -> dict[str, str]:
    raw_colors = data_block.get("colors")
    if not isinstance(raw_colors, dict):
        return {}
    normalized_colors: dict[str, str] = {}
    for key in THEME_COLOR_KEYS:
        value = raw_colors.get(key)
        if isinstance(value, str):
            normalized_hex = normalize_hex_color(value)
            if normalized_hex:
                normalized_colors[key] = normalized_hex
    return normalized_colors


def merge_theme_colors(
    *,
    base_theme: dict[str, Any],
    color_overrides: dict[str, str],
) -> dict[str, str] | None:
    data = base_theme.get("data")
    base_colors = data.get("colors") if isinstance(data, dict) else None
    if not isinstance(base_colors, dict):
        return None
    merged: dict[str, str] = {}
    for key in THEME_COLOR_KEYS:
        override = color_overrides.get(key)
        if override:
            merged[key] = override
            continue
        base_value = base_colors.get(key)
        if isinstance(base_value, str):
            merged[key] = normalize_hex_color(base_value) or base_value
            continue
        merged[key] = "#000000"
    return merged


def extract_text_font_from_payload(
    data_block: dict[str, Any],
    base_theme: dict[str, Any],
) -> dict[str, str] | None:
    candidate: dict[str, Any] | None = None
    fonts = data_block.get("fonts")
    if isinstance(fonts, dict):
        text_font = fonts.get("textFont")
        if isinstance(text_font, dict):
            candidate = text_font
    if candidate is None:
        text_font = data_block.get("textFont")
        if isinstance(text_font, dict):
            candidate = text_font
    if candidate is None:
        base_data = base_theme.get("data")
        base_fonts = base_data.get("fonts") if isinstance(base_data, dict) else None
        base_text_font = base_fonts.get("textFont") if isinstance(base_fonts, dict) else None
        if isinstance(base_text_font, dict):
            candidate = base_text_font
    if candidate is None:
        candidate = DEFAULT_THEME_FONT

    name = candidate.get("name")
    url = candidate.get("url")
    if not isinstance(name, str) or not name.strip():
        return None
    if not isinstance(url, str) or not url.strip():
        return None
    return {"name": name.strip(), "url": url.strip()}


def select_theme_for_query(
    requested_theme: str,
    available_themes: list[dict[str, Any]],
    current_theme: dict[str, Any] | None,
) -> dict[str, Any] | None:
    normalized_query = requested_theme.strip().lower()
    if not normalized_query:
        return None

    for theme in available_themes:
        theme_id = str(theme.get("id") or "").strip().lower()
        theme_name = str(theme.get("name") or "").strip().lower()
        if normalized_query in {theme_id, theme_name}:
            return theme

    current_theme_id = str((current_theme or {}).get("id") or "").strip().lower()
    query_tokens = [token for token in normalized_query.replace("_", "-").split("-") if token]

    if "dark" in query_tokens or any(token in normalized_query for token in ("night", "black")):
        for preferred in ("professional-dark", "edge-yellow"):
            theme = find_theme_by_id(available_themes, preferred)
            if theme:
                return theme

    if "light" in query_tokens or any(token in normalized_query for token in ("bright", "white")):
        for preferred in ("professional-blue", "mint-blue", "light-rose"):
            theme = find_theme_by_id(available_themes, preferred)
            if theme:
                return theme

    if any(token in normalized_query for token in ("another", "different", "change")):
        opposite = not is_dark_theme(current_theme) if current_theme else True
        candidates = [
            theme
            for theme in available_themes
            if str(theme.get("id") or "").strip().lower() != current_theme_id
        ]
        for theme in candidates:
            if is_dark_theme(theme) == opposite:
                return theme
        if candidates:
            return candidates[0]

    for theme in available_themes:
        haystack = " ".join(
            [
                str(theme.get("id") or "").strip().lower(),
                str(theme.get("name") or "").strip().lower(),
                str(theme.get("description") or "").strip().lower(),
            ]
        )
        if normalized_query in haystack:
            return theme
        if query_tokens and all(token in haystack for token in query_tokens):
            return theme
    return None


def find_theme_by_id(
    themes: list[dict[str, Any]],
    theme_id: str,
) -> dict[str, Any] | None:
    normalized_theme_id = theme_id.strip().lower()
    for theme in themes:
        current_id = str(theme.get("id") or "").strip().lower()
        if current_id == normalized_theme_id:
            return theme
    return None
