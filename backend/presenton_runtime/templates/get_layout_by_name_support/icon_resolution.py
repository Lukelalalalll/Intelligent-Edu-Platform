from __future__ import annotations

from typing import Any

from utils.icon_weights import extract_icon_weight_from_settings

from .default_templates import (
    LOGGER,
    fetch_template_fallback_payload,
    read_builtin_template_settings,
)


async def apply_icon_weight_overrides(
    *,
    layout_name: str,
    schema_payload: dict[str, Any],
) -> dict[str, Any]:
    if not layout_name.startswith("custom-"):
        fallback_payload, _ = await fetch_template_fallback_payload(layout_name)
        if fallback_payload:
            schema_payload["icon_weight"] = extract_icon_weight_from_settings(
                fallback_payload
            )

    local_settings = read_builtin_template_settings(layout_name)
    if local_settings:
        local_icon_weight = extract_icon_weight_from_settings(local_settings)
        schema_payload["icon_weight"] = local_icon_weight
        LOGGER.info(
            "[template_layout] local settings applied template=%r icon_weight=%s",
            layout_name,
            local_icon_weight,
        )
    return schema_payload
