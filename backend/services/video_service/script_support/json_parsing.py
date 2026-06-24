from __future__ import annotations

import json
import re
from typing import Any


def parse_json_object(raw: str) -> dict | None:
    start = raw.find("{")
    if start == -1:
        return None

    depth = 0
    end = -1
    in_string = False
    escape_next = False
    for i, ch in enumerate(raw[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end == -1:
        end = raw.rfind("}") + 1
        if end <= start:
            return None

    return _parse_json_with_repairs(raw[start:end])


def parse_string_array(raw: str, *, limit: int) -> list[str] | None:
    json_match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not json_match:
        return None

    parsed = _parse_json_with_repairs(json_match.group())
    if not isinstance(parsed, list):
        return None
    return [_coerce_segment(item) for item in parsed if item][:limit]


def _parse_json_with_repairs(candidate: str) -> Any | None:
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    fixed = re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", candidate)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    stripped = re.sub(r'\\(?!["\\/])', "", candidate)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def _coerce_segment(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        for key in ("text", "script", "narration", "content", "segment"):
            if key in item:
                return str(item[key])
        return " ".join(str(v) for v in item.values())
    return str(item)
