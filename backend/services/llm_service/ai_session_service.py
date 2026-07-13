from typing import Any

from backend.schemas.ai import UpdateAiSessionSchema

MAX_TOTAL_ATTACHMENT_META_CHARS = 6000


_ALLOWED_MESSAGE_KEYS = {
    "role",
    "content",
    "reasoning",
    "is_course_relevant",
    "images",
    "files",
    "citations",
    "ui_elements",
    "tool_progresses",
}
_ALLOWED_FILE_KEYS = {"file_name", "mime_type"}


def _sanitize_json_value(value: Any, *, max_string_chars: int = 2000, depth: int = 0) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:max_string_chars]
    if depth >= 4:
        return str(value)[:max_string_chars]
    if isinstance(value, list):
        return [
            _sanitize_json_value(item, max_string_chars=max_string_chars, depth=depth + 1)
            for item in value[:32]
        ]
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for raw_key, raw_value in list(value.items())[:24]:
            key = str(raw_key)[:80]
            cleaned[key] = _sanitize_json_value(
                raw_value,
                max_string_chars=max_string_chars,
                depth=depth + 1,
            )
        return cleaned
    return str(value)[:max_string_chars]


def sanitize_session_update_payload(payload: UpdateAiSessionSchema) -> dict[str, Any]:
    update_fields: dict[str, Any] = {}

    if payload.title is not None:
        update_fields["title"] = str(payload.title).strip()[:200]
    if payload.history_start is not None:
        update_fields["history_start"] = int(payload.history_start)

    if payload.messages is None:
        return update_fields

    total_file_meta_chars = 0
    cleaned_messages: list[dict[str, Any]] = []
    for msg in payload.messages:
        item = msg.model_dump()
        cleaned: dict[str, Any] = {}
        for key in _ALLOWED_MESSAGE_KEYS:
            if key not in item:
                continue
            if key == "role":
                cleaned["role"] = str(item.get("role", "")).strip().lower()
            elif key == "content":
                cleaned["content"] = str(item.get("content", ""))[:12000]
            elif key == "reasoning":
                cleaned["reasoning"] = str(item.get("reasoning", ""))[:20000]
            elif key == "is_course_relevant":
                if item.get("is_course_relevant") is not None:
                    cleaned["is_course_relevant"] = bool(item.get("is_course_relevant"))
            elif key == "images":
                images = item.get("images", []) or []
                cleaned["images"] = [str(img)[:2_000_000] for img in images[:8] if str(img)]
            elif key == "files":
                files = []
                for f in (item.get("files", []) or [])[:20]:
                    safe_meta = {k: str(f.get(k, "")) for k in _ALLOWED_FILE_KEYS if str(f.get(k, ""))}
                    safe_meta["file_name"] = safe_meta.get("file_name", "")[:200]
                    safe_meta["mime_type"] = safe_meta.get("mime_type", "application/octet-stream")[:100]
                    total_file_meta_chars += len(safe_meta.get("file_name", "")) + len(safe_meta.get("mime_type", ""))
                    files.append(safe_meta)
                cleaned["files"] = files
            elif key == "citations":
                cleaned["citations"] = [
                    _sanitize_json_value(citation, max_string_chars=12000)
                    for citation in (item.get("citations", []) or [])[:32]
                    if isinstance(citation, dict)
                ]
            elif key == "ui_elements":
                cleaned["ui_elements"] = [
                    _sanitize_json_value(element, max_string_chars=4000)
                    for element in (item.get("ui_elements", []) or [])[:16]
                    if isinstance(element, dict)
                ]
            elif key == "tool_progresses":
                cleaned["tool_progresses"] = [
                    _sanitize_json_value(progress, max_string_chars=4000)
                    for progress in (item.get("tool_progresses", []) or [])[:32]
                    if isinstance(progress, dict)
                ]
        cleaned_messages.append(cleaned)

    if total_file_meta_chars > MAX_TOTAL_ATTACHMENT_META_CHARS:
        raise ValueError("Attachment metadata is too large")

    update_fields["messages"] = cleaned_messages
    return update_fields
