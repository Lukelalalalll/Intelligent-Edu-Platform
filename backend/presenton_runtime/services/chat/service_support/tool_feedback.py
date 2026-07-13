from __future__ import annotations

import json
from typing import Any

import dirtyjson  # type: ignore[import-untyped]


def summarize_model_note(chunks: list[str]) -> str:
    text = "".join(chunks).strip()
    if not text or text in {"{}", "[]"}:
        return ""

    compact = " ".join(text.split())
    if compact.lower() in {"start", "end"}:
        return ""
    if len(compact) > 600:
        return f"{compact[:600].rstrip()}..."
    return compact


def event_text(event: Any) -> str:
    for attr in ("chunk", "delta", "text", "content"):
        value = getattr(event, attr, None)
        if isinstance(value, str):
            return value
    return ""


def tool_focus_from_arguments(
    *,
    tool_name: str,
    arguments: str | None,
) -> dict[str, Any] | None:
    if tool_name not in {"getSlideAtIndex", "saveSlide", "deleteSlide"}:
        return None

    parsed_args: dict[str, Any]
    try:
        parsed_args = dirtyjson.loads(arguments or "{}")
    except Exception:
        try:
            parsed_args = json.loads(arguments or "{}")
        except Exception:
            return None
    if not isinstance(parsed_args, dict):
        return None

    focus_payload: dict[str, Any] = {}
    index = parsed_args.get("index")
    if isinstance(index, int):
        normalized_index = max(0, index)
        focus_payload["slide_index"] = normalized_index
        focus_payload["slide_number"] = normalized_index + 1

    target_slide_indices = extract_target_slide_indices(parsed_args)
    if target_slide_indices:
        focus_payload["target_slide_indices"] = target_slide_indices
        focus_payload["target_slide_numbers"] = [
            candidate + 1 for candidate in target_slide_indices
        ]
    return focus_payload or None


def tool_focus_from_result(
    *,
    tool_name: str,
    tool_result: dict[str, Any],
) -> dict[str, Any] | None:
    if tool_name not in {"getSlideAtIndex", "saveSlide", "deleteSlide"}:
        return None
    if not tool_result.get("ok"):
        return None

    result = tool_result.get("result")
    if not isinstance(result, dict):
        return None

    focus_payload: dict[str, Any] = {}
    index: int | None = None
    resolved_index = result.get("resolved_index")
    if isinstance(resolved_index, int):
        index = resolved_index
    else:
        direct_index = result.get("index")
        if isinstance(direct_index, int):
            index = direct_index
        else:
            slide = result.get("slide")
            if isinstance(slide, dict) and isinstance(slide.get("index"), int):
                index = slide["index"]

    if index is not None:
        normalized_index = max(0, index)
        focus_payload["slide_index"] = normalized_index
        focus_payload["slide_number"] = normalized_index + 1

    target_slide_indices = extract_target_slide_indices(result)
    if target_slide_indices:
        focus_payload["target_slide_indices"] = target_slide_indices
        focus_payload["target_slide_numbers"] = [
            candidate + 1 for candidate in target_slide_indices
        ]
    return focus_payload or None


def extract_target_slide_indices(payload: dict[str, Any]) -> list[int]:
    raw_candidates = []
    for key in (
        "target_slide_indices",
        "targetSlideIndices",
        "target_indices",
        "targetIndices",
        "slide_indices",
        "slideIndices",
        "indices",
    ):
        value = payload.get(key)
        if isinstance(value, list):
            raw_candidates.extend(value)

    normalized_indices: list[int] = []
    seen_indices: set[int] = set()
    for candidate in raw_candidates:
        if not isinstance(candidate, int):
            continue
        normalized_index = max(0, candidate)
        if normalized_index in seen_indices:
            continue
        seen_indices.add(normalized_index)
        normalized_indices.append(normalized_index)
    return normalized_indices


def tool_start_message(tool_name: str) -> str:
    labels = {
        "getPresentationOutline": "Reading the presentation outline",
        "searchSlides": "Searching relevant slides",
        "getSlideAtIndex": "Opening the requested slide",
        "getPresentationThemeCatalog": "Checking available themes",
        "getAvailableLayouts": "Checking available layouts",
        "getContentSchemaFromLayoutId": "Checking the layout schema",
        "generateAssets": "Generating slide assets",
        "saveSlide": "Saving the slide",
        "deleteSlide": "Deleting the slide",
        "setPresentationTheme": "Applying presentation theme",
    }
    return labels.get(tool_name, f"Running {tool_name}")


def build_tool_limit_fallback(last_tool_results: list[dict[str, Any]]) -> str:
    for entry in reversed(last_tool_results):
        if not isinstance(entry, dict):
            continue
        if not entry.get("ok"):
            continue
        result = entry.get("result")
        if not isinstance(result, dict):
            continue
        message = result.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

    return (
        "I completed several tool operations but could not finalize the response "
        "within the tool limit. Please ask a follow-up and I will continue."
    )


def summarize_tool_result(tool_name: str, tool_result: dict[str, Any]) -> str:
    if not tool_result.get("ok"):
        error = tool_result.get("error")
        if isinstance(error, str) and error.strip():
            return f"{tool_name} failed: {error.strip()}"
        return f"{tool_name} failed."

    result = tool_result.get("result")
    if isinstance(result, dict):
        message = result.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

        note = result.get("note")
        if isinstance(note, str) and note.strip():
            return note.strip()

        count = result.get("count")
        if isinstance(count, int):
            return f"{tool_name} returned {count} result(s)."

        found = result.get("found")
        if isinstance(found, bool):
            return (
                f"{tool_name} found requested data."
                if found
                else f"{tool_name} did not find matching data."
            )

    return f"{tool_name} completed."
