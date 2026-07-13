from __future__ import annotations

import json
from typing import Any

import dirtyjson  # type: ignore[import-untyped]


def parse_tool_arguments(arguments: str | None) -> dict[str, Any]:
    if not arguments:
        return {}

    try:
        parsed = dirtyjson.loads(arguments)
    except Exception:
        parsed = json.loads(arguments)

    normalized = json.loads(json.dumps(parsed, ensure_ascii=False))
    if isinstance(normalized, dict):
        return normalized
    raise ValueError("Tool arguments must be a JSON object.")


def normalize_slide_lookup_args(args: dict[str, Any]) -> dict[str, Any]:
    normalized_args = dict(args)
    normalized_args.setdefault("includeFullContent", False)
    return normalized_args


def normalize_save_slide_args(args: dict[str, Any]) -> dict[str, Any]:
    payload_args = json.loads(json.dumps(dict(args), ensure_ascii=False))
    raw_content = payload_args.get("content")
    if isinstance(raw_content, dict):
        payload_args["content"] = json.dumps(raw_content, ensure_ascii=False)
    return payload_args


def parse_slide_content(content: str) -> dict[str, Any]:
    try:
        content_parsed: Any = dirtyjson.loads(content)
    except Exception:
        content_parsed = json.loads(content)

    if not isinstance(content_parsed, dict):
        raise ValueError("'content' must be a JSON object.")
    return json.loads(json.dumps(content_parsed, ensure_ascii=False))
