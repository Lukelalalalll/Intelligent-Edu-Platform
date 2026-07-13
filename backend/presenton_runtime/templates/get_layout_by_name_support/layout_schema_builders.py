from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from templates.presentation_layout import PresentationLayoutModel

from .default_templates import LOGGER, preview_detail


def build_presentation_layout_model(
    *,
    layout_name: str,
    schema_payload: dict[str, Any],
) -> PresentationLayoutModel:
    slides = schema_payload.get("slides") or []
    if not slides:
        LOGGER.error(
            "[template_layout] slides empty after resolve template=%r keys=%s",
            layout_name,
            list(schema_payload.keys()),
        )
        raise HTTPException(
            status_code=404,
            detail=f"Template '{layout_name}' not found",
        )

    LOGGER.info(
        "[template_layout] building PresentationLayoutModel template=%r slides=%d icon_weight=%s",
        layout_name,
        len(slides),
        schema_payload.get("icon_weight"),
    )
    return PresentationLayoutModel(**schema_payload)


def raise_layout_not_found(layout_name: str, detail: str) -> None:
    LOGGER.error(
        "[template_layout] no schema payload template=%r combined_detail=%s",
        layout_name,
        preview_detail(detail),
    )
    raise HTTPException(
        status_code=404,
        detail=f"Template '{layout_name}' not found: {detail}",
    )
