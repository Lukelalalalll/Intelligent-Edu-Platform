from typing import Any

from backend.schemas.ai import UpdateAiSessionSchema

MAX_TOTAL_ATTACHMENT_META_CHARS = 6000


_ALLOWED_MESSAGE_KEYS = {"role", "content", "images", "files"}
_ALLOWED_FILE_KEYS = {"file_name", "mime_type"}


def sanitize_session_update_payload(payload: UpdateAiSessionSchema) -> dict[str, Any]:
    update_fields: dict[str, Any] = {}

    if payload.title is not None:
        update_fields["title"] = str(payload.title).strip()[:200]

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
        cleaned_messages.append(cleaned)

    if total_file_meta_chars > MAX_TOTAL_ATTACHMENT_META_CHARS:
        raise ValueError("Attachment metadata is too large")

    update_fields["messages"] = cleaned_messages
    return update_fields
