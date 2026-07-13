from __future__ import annotations

import json
import re
from typing import Any

from models.sql.slide import SlideModel


def serialize_slide(slide: SlideModel) -> str:
    content_text = ""
    try:
        content_text = json.dumps(slide.content or {}, ensure_ascii=False)
    except Exception:
        content_text = str(slide.content)

    speaker_note = slide.speaker_note or ""
    return (
        f"slide_index={slide.index}\n"
        f"layout_id={slide.layout}\n"
        f"{content_text}\n"
        f"{speaker_note}"
    )


def build_snippet(text: str, query_lower: str, window: int = 320) -> str:
    normalized = " ".join(text.split())
    if not normalized:
        return ""

    offset = normalized.lower().find(query_lower)
    if offset == -1:
        return normalized[:window]

    start = max(0, offset - window // 3)
    end = min(len(normalized), start + window)
    return normalized[start:end]


def extract_query_tokens(query: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", (query or "").lower()))


def extract_theme_name(theme: dict[str, Any] | None) -> str | None:
    if not isinstance(theme, dict):
        return None
    name = theme.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    theme_id = theme.get("id")
    if isinstance(theme_id, str) and theme_id.strip():
        return theme_id.strip()
    return None


def is_dark_theme(theme: dict[str, Any] | None) -> bool:
    if not isinstance(theme, dict):
        return False
    data = theme.get("data")
    if not isinstance(data, dict):
        return False
    colors = data.get("colors")
    if not isinstance(colors, dict):
        return False
    background = colors.get("background")
    if not isinstance(background, str):
        return False
    return is_dark_hex(background)


def is_dark_hex(hex_color: str) -> bool:
    normalized = hex_color.strip().lstrip("#")
    if len(normalized) != 6:
        return False
    try:
        red = int(normalized[0:2], 16)
        green = int(normalized[2:4], 16)
        blue = int(normalized[4:6], 16)
    except ValueError:
        return False
    luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    return luma < 0.5


def sanitize_theme_id(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug[:64]


def normalize_hex_color(value: str) -> str | None:
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized.startswith("#"):
        normalized = normalized[1:]

    if len(normalized) == 3:
        expanded = "".join(ch * 2 for ch in normalized)
        if re.fullmatch(r"[0-9a-f]{6}", expanded):
            return f"#{expanded}"
        return None

    if len(normalized) != 6 or not re.fullmatch(r"[0-9a-f]{6}", normalized):
        return None
    return f"#{normalized}"
