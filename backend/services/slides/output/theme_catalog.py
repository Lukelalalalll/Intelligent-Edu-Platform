from __future__ import annotations

import os
from typing import Dict, List


THEME_VARIANTS = {
    "Business": [
        ("Business", "Classic business deck with strong hierarchy."),
        ("Business Clean", "Balanced spacing and practical layout for lectures."),
        ("Business Executive", "Data-first style for strategy and reporting."),
    ],
    "Classic": [
        ("Classic", "Traditional classroom look with familiar structure."),
        ("Classic Seminar", "Academic tone for theory-heavy courses."),
        ("Classic Formal", "Conservative style for assessments and reviews."),
    ],
    "Dark": [
        ("Dark", "High-contrast dark visuals for projection rooms."),
        ("Dark Focus", "Low-distraction dark style for technical content."),
        ("Dark Neon", "Bold accent dark style for modern topics."),
    ],
    "Light": [
        ("Light", "Bright and readable for everyday teaching."),
        ("Light Air", "Clean minimal spacing for concise storytelling."),
        ("Light Academic", "Paper-like look for dense conceptual material."),
    ],
}

# PPT Generator-style template groups (from presentation-templates folders)
# are mapped to available local PPTX base themes.
PPT_GENERATOR_GROUP_MAP = {
    "general": "Light",
    "modern": "Business",
    "standard": "Classic",
    "swift": "Dark",
    "neo-general": "Light",
    "neo-modern": "Business",
    "neo-standard": "Classic",
    "neo-swift": "Dark",
    "education": "Classic",
    "report": "Business",
    "code": "Dark",
    "pitch-deck": "Business",
    "pitchdeck": "Business",
    "product-overview": "Business",
    "productoverview": "Business",
}

PPT_GENERATOR_LAYOUT_COUNTS = {
    "general": 12,
    "modern": 10,
    "standard": 11,
    "swift": 9,
    "code": 16,
    "education": 14,
    "product-overview": 21,
    "productoverview": 21,
    "report": 22,
    "pitch-deck": 25,
    "pitchdeck": 25,
    "neo-general": 29,
    "neo-modern": 17,
    "neo-standard": 17,
    "neo-swift": 15,
}

ENABLE_PPT_GENERATOR_THEME_ALIASES = (
    os.getenv("SUB1_ENABLE_PPT_GENERATOR_THEME_ALIASES", "false").strip().lower() == "true"
)


def build_theme_catalog(template_names: List[str]) -> List[Dict[str, str]]:
    """Build a richer theme catalog from available base templates.

    We expose multiple user-facing variants, but each variant maps back to one
    physical base template so existing PPT generation remains compatible.
    """
    available = set(template_names)
    themes: List[Dict[str, str]] = []

    for base_theme, variants in THEME_VARIANTS.items():
        if base_theme not in available:
            continue
        for name, description in variants:
            themes.append(
                {
                    "name": name,
                    "base_theme": base_theme,
                    "description": description,
                    "preview_theme": base_theme,
                    "source": "local_pptx",
                }
            )

    # PPT Generator aliases are opt-in because they are mapped to local PPTX themes.
    if ENABLE_PPT_GENERATOR_THEME_ALIASES:
        for group_name, mapped_base in PPT_GENERATOR_GROUP_MAP.items():
            if mapped_base not in available:
                continue
            display_name = f"PPT Generator {group_name.replace('-', ' ').title()}"
            themes.append(
                {
                    "name": display_name,
                    "base_theme": mapped_base,
                    "description": f"PPT Generator-mapped template family: {group_name}",
                    "preview_theme": mapped_base,
                    "source": "ppt_generator_alias",
                    "source_group": group_name,
                    "layout_count": PPT_GENERATOR_LAYOUT_COUNTS.get(group_name),
                }
            )

    # De-duplicate by display name while preserving order.
    deduped: List[Dict[str, str]] = []
    seen = set()
    for theme in themes:
        key = theme.get("name", "")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(theme)
    themes = deduped

    # Keep backward compatibility if catalog is empty for any reason.
    if not themes:
        for name in sorted(available):
            themes.append(
                {
                    "name": name,
                    "base_theme": name,
                    "description": f"Use layouts with the theme: {name}",
                    "preview_theme": name,
                    "source": "local_pptx",
                }
            )

    return themes


def resolve_base_theme(requested_theme: str, template_names: List[str]) -> str:
    """Resolve user-facing theme name to an existing physical template name."""
    available = set(template_names)
    if requested_theme in available:
        return requested_theme

    normalized = (requested_theme or "").strip()
    if not normalized:
        raise ValueError(f"Theme: {requested_theme} does not exist")

    # Support direct PPT Generator group keys (e.g., "code", "neo-modern").
    group_key = normalized.lower().replace(" ", "-")
    mapped = PPT_GENERATOR_GROUP_MAP.get(group_key)
    if mapped in available:
        return mapped

    # Support catalog display names (e.g., "PPT Generator Code").
    if normalized.lower().startswith("ppt generator "):
        suffix = normalized[len("PPT Generator ") :].strip().lower().replace(" ", "-")
        mapped = PPT_GENERATOR_GROUP_MAP.get(suffix)
        if mapped in available:
            return mapped

    for base_theme, variants in THEME_VARIANTS.items():
        if base_theme not in available:
            continue
        for variant_name, _ in variants:
            if variant_name == requested_theme:
                return base_theme

    raise ValueError(f"Theme: {requested_theme} does not exist")
