from __future__ import annotations

import random
import re

from fastapi import HTTPException


def _strip_code_fences(value: str) -> str:
    return (
        value.replace("```tsx", "")
        .replace("```typescript", "")
        .replace("```ts", "")
        .replace("```", "")
        .strip()
    )


_ASSET_FIELD_REPLACEMENTS = {
    "image_url": "__image_url__",
    "icon_url": "__icon_url__",
    "image_prompt": "__image_prompt__",
    "icon_query": "__icon_query__",
}

_ASSET_FIELD_DEFAULTS = {
    "__image_url__": "/static/images/replaceable_template_image.png",
    "__icon_url__": "/static/icons/placeholder.svg",
    "__image_prompt__": "replaceable image",
    "__icon_query__": "placeholder icon",
}


def _normalize_asset_fields(code: str) -> str:
    normalized = code
    for field_name, normalized_name in _ASSET_FIELD_REPLACEMENTS.items():
        normalized = re.sub(
            rf"(?<!_)\b{re.escape(field_name)}\b(?!_)",
            normalized_name,
            normalized,
        )

    def replace_bare_asset_field(match: re.Match[str]) -> str:
        indentation, field_name = match.groups()
        default_value = _ASSET_FIELD_DEFAULTS[field_name]
        return f'{indentation}{field_name}: "{default_value}",'

    return re.sub(
        r"(?m)^(\s*)(__(?:image_url|icon_url|image_prompt|icon_query)__)\s*,?\s*$",
        replace_bare_asset_field,
        normalized,
    )


def _normalize_layout_code_for_create(code: str) -> str:
    normalized = _normalize_asset_fields(_strip_code_fences(code))

    first_import_match = re.search(r"(?m)^\s*import\b", normalized)
    if first_import_match:
        normalized = normalized[first_import_match.start() :]

    first_export_match = re.search(r"(?m)^\s*export\b", normalized)
    if first_export_match:
        normalized = normalized[: first_export_match.start()]

    normalized = re.sub(
        r"(?ms)^\s*(?:import|export)\b.*?;(?:\r?\n|$)",
        "",
        normalized,
    )
    normalized = re.sub(
        r"(?m)^\s*(?:import|export)\b.*(?:\r?\n|$)",
        "",
        normalized,
    )
    normalized = normalized.strip()
    normalized = re.sub(
        r'(layoutId\s*=\s*["\'])([^"\']+)(["\'])',
        lambda match: (
            match.group(0)
            if re.search(r"-\d{4}$", match.group(2))
            else (
                f"{match.group(1)}{match.group(2)}-"
                f"{random.randint(1000, 9999)}{match.group(3)}"
            )
        ),
        normalized,
    )
    return normalized


def _update_layout_id_in_code(code: str) -> tuple[str, str]:
    match = re.search(r'(layoutId\s*=\s*["\'])([^"\']+)(["\'])', code)
    if not match:
        raise HTTPException(status_code=400, detail="layoutId not found in layout code")

    current_id = match.group(2)
    suffix = f"{random.randint(1000, 9999)}"
    new_id = re.sub(r"-\d{4}$", f"-{suffix}", current_id)
    if new_id == current_id:
        new_id = f"{current_id}-{suffix}"

    new_code = re.sub(
        r'(layoutId\s*=\s*["\'])([^"\']+)(["\'])',
        f"\\1{new_id}\\3",
        code,
        count=1,
    )
    return new_code, new_id
