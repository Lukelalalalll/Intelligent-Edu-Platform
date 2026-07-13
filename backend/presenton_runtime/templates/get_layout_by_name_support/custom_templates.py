from __future__ import annotations

from templates.custom_layout_from_db import load_custom_presentation_layout
from templates.presentation_layout import PresentationLayoutModel


def is_custom_layout_name(layout_name: str) -> bool:
    return layout_name.startswith("custom-")


async def resolve_custom_layout(layout_name: str) -> PresentationLayoutModel:
    return await load_custom_presentation_layout(layout_name)
