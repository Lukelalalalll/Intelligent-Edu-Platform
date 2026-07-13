from __future__ import annotations

import random
import re
from typing import Any

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
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

_TEXT_SANITIZE_SKIP_PARENTS = {
    "script",
    "style",
    "svg",
    "path",
    "defs",
    "clipPath",
    "linearGradient",
    "radialGradient",
    "pattern",
}
_IMAGE_PLACEHOLDER_URL = _ASSET_FIELD_DEFAULTS["__image_url__"]
_ICON_PLACEHOLDER_URL = _ASSET_FIELD_DEFAULTS["__icon_url__"]


def _quote_js_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _truncate_placeholder(value: str, *, original_length: int) -> str:
    if original_length <= 0:
        return value
    if len(value) <= original_length:
        return value
    return value[:original_length].rstrip() or value[:original_length]


def _split_top_level_items(value: str, delimiter: str = ",") -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    escaped = False
    for index, char in enumerate(value):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char in "[{(":
            depth += 1
            continue
        if char in "]})":
            depth = max(0, depth - 1)
            continue
        if char == delimiter and depth == 0:
            items.append(value[start:index].strip())
            start = index + 1
    tail = value[start:].strip()
    if tail:
        items.append(tail)
    return items


def _parse_style_declarations(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    declarations: dict[str, str] = {}
    for chunk in style.split(";"):
        key, separator, raw_value = chunk.partition(":")
        if not separator:
            continue
        declarations[key.strip().lower()] = raw_value.strip()
    return declarations


def _parse_css_dimension(value: str | None) -> tuple[float, str] | None:
    if not value:
        return None
    match = re.search(r"(-?\d+(?:\.\d+)?)\s*(px|%)?", value.strip(), flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1)), (match.group(2) or "px").lower()


def _font_size_from_tag(tag: Tag) -> float | None:
    for candidate in (
        tag.get("data-font-size"),
        _parse_style_declarations(tag.get("style")).get("font-size"),
    ):
        parsed = _parse_css_dimension(candidate)
        if parsed is not None and parsed[1] == "px":
            return parsed[0]
    return None


def _class_blob(tag: Tag) -> str:
    class_names = tag.get("class")
    if isinstance(class_names, str):
        classes = class_names
    else:
        classes = " ".join(class_names or [])
    return " ".join(
        filter(
            None,
            [
                classes,
                tag.get("id"),
                tag.get("data-editable-id"),
                tag.get("role"),
                tag.get("aria-label"),
                tag.get("alt"),
                tag.get("title"),
            ],
        )
    ).lower()


def _infer_text_field_name(tag: Tag, text: str) -> str:
    blob = _class_blob(tag)
    font_size = _font_size_from_tag(tag)
    normalized_text = _normalize_whitespace(text)

    if tag.name in {"th"}:
        return "column"
    if tag.name in {"td"}:
        return "cell"
    if tag.name in {"li"} or any(token in blob for token in {"bullet", "item", "point", "list"}):
        return "item"
    if any(token in blob for token in {"title", "headline"}):
        return "title"
    if any(token in blob for token in {"subtitle", "tagline"}):
        return "subtitle"
    if any(token in blob for token in {"heading", "header"}):
        return "heading"
    if any(token in blob for token in {"label"}):
        return "label"
    if any(token in blob for token in {"value", "metric", "stat", "number"}):
        return "value"
    if tag.name in {"h1", "h2"} or (font_size is not None and font_size >= 30):
        return "title"
    if tag.name in {"h3", "h4", "h5", "h6"} or (font_size is not None and font_size >= 22):
        return "heading"
    if font_size is not None and font_size >= 18:
        return "subtitle"
    if re.fullmatch(r"\d+(?:[.,:/-]\d+)*%?", normalized_text):
        return "value"
    return "description"


def _infer_asset_field_name(tag: Tag) -> str:
    blob = _class_blob(tag)
    style = _parse_style_declarations(tag.get("style"))
    width = _parse_css_dimension(style.get("width") or tag.get("width"))
    height = _parse_css_dimension(style.get("height") or tag.get("height"))

    if any(token in blob for token in {"icon", "symbol", "glyph"}):
        return "icon"
    src = (
        tag.get("src")
        or tag.get("href")
        or tag.get("xlink:href")
        or ""
    ).lower()
    if "/static/icons/" in src or src.endswith(".svg"):
        return "icon"
    if width and height and width[1] == "px" and height[1] == "px":
        if width[0] <= 96 and height[0] <= 96:
            return "icon"
    return "image"


def _looks_like_decorative_asset(tag: Tag) -> bool:
    blob = _class_blob(tag)
    if any(token in blob for token in {"background", "pattern", "texture", "grid", "gradient"}):
        return True
    style = _parse_style_declarations(tag.get("style"))
    width = _parse_css_dimension(style.get("width") or tag.get("width"))
    height = _parse_css_dimension(style.get("height") or tag.get("height"))
    if width and height:
        width_value, width_unit = width
        height_value, height_unit = height
        if width_unit == "%" and height_unit == "%" and width_value >= 80 and height_value >= 80:
            return True
        if width_unit == "px" and height_unit == "px" and width_value >= 900 and height_value >= 450:
            return True
    return False


def _text_placeholder_for_tag(
    tag: Tag,
    *,
    text: str,
    counters: dict[str, int],
    original_length: int | None = None,
) -> str:
    field_name = _infer_text_field_name(tag, text)
    counters[field_name] = counters.get(field_name, 0) + 1
    placeholder = _generic_text_for_field(field_name, index=counters[field_name] if field_name in {"item", "column", "cell", "label", "value"} else None)
    if original_length is not None:
        placeholder = _truncate_placeholder(placeholder, original_length=max(1, original_length))
    return placeholder


def _extract_source_literals_from_html(source_html: str) -> tuple[list[str], list[tuple[str, str]]]:
    soup = BeautifulSoup(source_html, "html.parser")
    texts: list[str] = []
    assets: list[tuple[str, str]] = []
    seen_texts: set[str] = set()
    seen_assets: set[tuple[str, str]] = set()

    for node in soup.descendants:
        if isinstance(node, Comment):
            continue
        if isinstance(node, NavigableString):
            parent = node.parent
            if not isinstance(parent, Tag):
                continue
            if parent.name in _TEXT_SANITIZE_SKIP_PARENTS:
                continue
            text = _normalize_whitespace(str(node))
            if not text or len(text) < 2:
                continue
            if text not in seen_texts:
                seen_texts.add(text)
                texts.append(text)
            continue
        if not isinstance(node, Tag):
            continue
        if node.name not in {"img", "image"}:
            continue
        asset_url = node.get("src") or node.get("href") or node.get("xlink:href")
        if not asset_url:
            continue
        field_name = _infer_asset_field_name(node)
        item = (asset_url, field_name)
        if item not in seen_assets:
            seen_assets.add(item)
            assets.append(item)
        for attr_name in ("alt", "title", "aria-label"):
            attr_value = _normalize_whitespace(node.get(attr_name) or "")
            if not attr_value or len(attr_value) < 2:
                continue
            if attr_value not in seen_texts:
                seen_texts.add(attr_value)
                texts.append(attr_value)

    texts.sort(key=len, reverse=True)
    assets.sort(key=lambda item: len(item[0]), reverse=True)
    return texts, assets


def _placeholder_for_source_text(text: str) -> str:
    normalized = _normalize_whitespace(text)
    if re.fullmatch(r"\d+(?:[.,:/-]\d+)*%?", normalized):
        return "10"
    if len(normalized) <= 24 and normalized == normalized.title():
        return "Sample Title"
    if len(normalized) <= 30:
        return "Sample item"
    return "Sample description text"


def _sanitize_source_literals_in_code(code: str, *, source_html: str | None = None) -> str:
    if not source_html:
        return code

    texts, assets = _extract_source_literals_from_html(source_html)
    sanitized = code

    for asset_url, field_name in assets:
        placeholder = _ICON_PLACEHOLDER_URL if field_name == "icon" else _IMAGE_PLACEHOLDER_URL
        sanitized = sanitized.replace(asset_url, placeholder)

    for text in texts:
        placeholder = _placeholder_for_source_text(text)
        sanitized = sanitized.replace(text, placeholder)

    return sanitized


def _sanitize_slide_html(slide_html: str) -> str:
    soup = BeautifulSoup(slide_html, "html.parser")
    counters: dict[str, int] = {}

    for node in soup.descendants:
        if isinstance(node, Comment):
            node.extract()
            continue
        if isinstance(node, NavigableString):
            parent = node.parent
            if not isinstance(parent, Tag):
                continue
            if parent.name in _TEXT_SANITIZE_SKIP_PARENTS:
                continue
            original_text = str(node)
            stripped = original_text.strip()
            if not stripped:
                continue
            leading_length = len(original_text) - len(original_text.lstrip())
            trailing_length = len(original_text) - len(original_text.rstrip())
            placeholder = _text_placeholder_for_tag(
                parent,
                text=stripped,
                counters=counters,
                original_length=len(stripped),
            )
            node.replace_with(
                f"{original_text[:leading_length]}{placeholder}{original_text[len(original_text) - trailing_length:] if trailing_length else ''}"
            )
            continue
        if not isinstance(node, Tag):
            continue
        if node.name not in {"img", "image"}:
            continue

        asset_field_name = _infer_asset_field_name(node)
        if not _looks_like_decorative_asset(node):
            placeholder_url = _ICON_PLACEHOLDER_URL if asset_field_name == "icon" else _IMAGE_PLACEHOLDER_URL
            if node.has_attr("src"):
                node["src"] = placeholder_url
            if node.has_attr("href"):
                node["href"] = placeholder_url
            if node.has_attr("xlink:href"):
                node["xlink:href"] = placeholder_url

        if node.has_attr("alt"):
            node["alt"] = "Placeholder icon" if asset_field_name == "icon" else "Sample image"
        if node.has_attr("aria-label"):
            node["aria-label"] = "Placeholder icon" if asset_field_name == "icon" else "Sample image"
        if node.has_attr("title"):
            node["title"] = "Placeholder icon" if asset_field_name == "icon" else "Sample image"

    return str(soup)


def _find_matching_index(value: str, *, start_index: int, opening: str, closing: str) -> int:
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(start_index, len(value)):
        char = value[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char == opening:
            depth += 1
            continue
        if char == closing:
            depth -= 1
            if depth == 0:
                return index
    raise ValueError(f"Unbalanced literal while searching for {closing}")


def _js_string_literal_value(literal: str) -> str:
    quote = literal[0]
    inner = literal[1:-1]
    inner = inner.replace(f"\\{quote}", quote)
    inner = inner.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "\r")
    inner = inner.replace("\\\\", "\\")
    return inner


def _generic_text_for_field(field_name: str, *, index: int | None = None) -> str:
    normalized = field_name.strip("_").replace("-", "_").lower()
    numbered_suffix = f" {index}" if index is not None else ""
    if "title" in normalized and "subtitle" not in normalized:
        return f"Sample Title{numbered_suffix}"
    if "subtitle" in normalized:
        return f"Sample Subtitle{numbered_suffix}"
    if "heading" in normalized:
        return f"Sample Heading{numbered_suffix}"
    if "description" in normalized or "summary" in normalized or "body" in normalized:
        return f"Sample description text{numbered_suffix}"
    if "content" in normalized or normalized.endswith("text") or normalized == "text":
        return f"Sample supporting text{numbered_suffix}"
    if "bullet" in normalized or "point" in normalized or "item" in normalized:
        return f"Sample item{numbered_suffix}"
    if "section" in normalized:
        return f"Section{numbered_suffix}"
    if "category" in normalized:
        return f"Category{numbered_suffix}"
    if "column" in normalized:
        return f"Column{numbered_suffix}"
    if "label" in normalized:
        return f"Label{numbered_suffix}"
    if normalized == "name" or normalized.endswith("_name"):
        return f"Series{numbered_suffix}"
    if "value" in normalized:
        return f"Value{numbered_suffix}"
    if "page" in normalized:
        return "1"
    return f"Sample {normalized.replace('_', ' ').strip() or 'text'}{numbered_suffix}"


def _sanitize_string_literal(literal: str, *, field_name: str, index: int | None = None) -> str:
    original_value = _js_string_literal_value(literal)
    placeholder = _generic_text_for_field(field_name, index=index)
    placeholder = _truncate_placeholder(placeholder, original_length=max(1, len(original_value)))
    return _quote_js_string(placeholder)


def _sanitize_scalar_literal(
    literal: str,
    *,
    field_name: str,
    index: int | None = None,
) -> str:
    stripped = literal.strip()
    if field_name in _ASSET_FIELD_DEFAULTS:
        return _quote_js_string(_ASSET_FIELD_DEFAULTS[field_name])
    if len(stripped) >= 2 and stripped[0] in {"'", '"'} and stripped[-1] == stripped[0]:
        return _sanitize_string_literal(stripped, field_name=field_name, index=index)
    if re.fullmatch(r"-?\d+(?:\.\d+)?", stripped):
        if "page" in field_name.lower():
            return "1"
        base = 10 * (index or 1)
        return str(base)
    return stripped


def _sanitize_array_literal(
    literal: str,
    *,
    field_name: str,
) -> str:
    inner = literal[1:-1].strip()
    if not inner:
        return "[]"
    items = _split_top_level_items(inner)
    normalized_name = field_name.strip("_").lower()
    sanitized_items: list[str] = []
    for index, item in enumerate(items, start=1):
        stripped = item.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            child_name = "cell" if normalized_name == "rows" else field_name
            sanitized_items.append(_sanitize_array_literal(stripped, field_name=child_name))
        elif stripped.startswith("{") and stripped.endswith("}"):
            child_name = "row" if normalized_name == "series" else field_name
            sanitized_items.append(_sanitize_object_literal(stripped, field_name=child_name))
        else:
            item_field_name = field_name
            if normalized_name == "columns":
                item_field_name = "column"
            elif normalized_name == "categories":
                item_field_name = "category"
            elif normalized_name == "rows":
                item_field_name = "cell"
            elif normalized_name == "series":
                item_field_name = "name"
            elif normalized_name.endswith("items") or normalized_name.endswith("points"):
                item_field_name = "item"
            sanitized_items.append(
                _sanitize_scalar_literal(
                    stripped,
                    field_name=item_field_name,
                    index=index,
                )
            )
    return "[" + ", ".join(sanitized_items) + "]"


def _sanitize_object_literal(
    literal: str,
    *,
    field_name: str,
) -> str:
    inner = literal[1:-1].strip()
    if not inner:
        return "{}"
    pairs = _split_top_level_items(inner)
    sanitized_pairs: list[str] = []
    for pair in pairs:
        key, separator, raw_value = pair.partition(":")
        if not separator:
            sanitized_pairs.append(pair.strip())
            continue
        key_name = key.strip().strip("'\"")
        value = raw_value.strip()
        if key_name in _ASSET_FIELD_DEFAULTS:
            sanitized_value = _quote_js_string(_ASSET_FIELD_DEFAULTS[key_name])
        elif value.startswith("{") and value.endswith("}"):
            sanitized_value = _sanitize_object_literal(value, field_name=key_name)
        elif value.startswith("[") and value.endswith("]"):
            sanitized_value = _sanitize_array_literal(value, field_name=key_name)
        else:
            sanitized_value = _sanitize_scalar_literal(value, field_name=key_name)
        sanitized_pairs.append(f"{key.strip()}: {sanitized_value}")
    return "{ " + ", ".join(sanitized_pairs) + " }"


def _extract_enclosing_field_name(code: str, *, before_index: int) -> str:
    prefix = code[:before_index]
    matches = list(re.finditer(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\.", prefix))
    if not matches:
        return "text"
    return matches[-1].group(1)


def _sanitize_default_literal(literal: str, *, field_name: str) -> str:
    stripped = literal.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        return _sanitize_array_literal(stripped, field_name=field_name)
    if stripped.startswith("{") and stripped.endswith("}"):
        return _sanitize_object_literal(stripped, field_name=field_name)
    return _sanitize_scalar_literal(stripped, field_name=field_name)


def _sanitize_schema_defaults(code: str) -> str:
    result: list[str] = []
    cursor = 0
    while True:
        match = re.search(r"\.default\s*\(", code[cursor:])
        if not match:
            result.append(code[cursor:])
            break
        start = cursor + match.start()
        open_paren = cursor + match.end() - 1
        close_paren = _find_matching_index(code, start_index=open_paren, opening="(", closing=")")
        literal = code[open_paren + 1 : close_paren]
        field_name = _extract_enclosing_field_name(code, before_index=start)
        sanitized_literal = _sanitize_default_literal(literal, field_name=field_name)
        result.append(code[cursor : open_paren + 1])
        result.append(sanitized_literal)
        result.append(")")
        cursor = close_paren + 1
    return "".join(result)


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


def _normalize_layout_code_for_create(code: str, *, source_html: str | None = None) -> str:
    normalized = _sanitize_source_literals_in_code(
        _normalize_asset_fields(_strip_code_fences(code)),
        source_html=source_html,
    )

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
    normalized = _sanitize_schema_defaults(normalized)
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
