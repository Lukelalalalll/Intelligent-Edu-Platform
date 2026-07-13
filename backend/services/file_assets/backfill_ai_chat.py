from __future__ import annotations

import re
from datetime import datetime, timezone

from backend.repositories import ai_session_repo, file_asset_repo

from .shared import utcnow


def _guess_mime_from_name(filename: str) -> str:
    lower = str(filename or "").lower()
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".ppt"):
        return "application/vnd.ms-powerpoint"
    if lower.endswith(".pptx"):
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if lower.endswith(".doc"):
        return "application/msword"
    if lower.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if lower.endswith(".xls"):
        return "application/vnd.ms-excel"
    if lower.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lower.endswith(".md"):
        return "text/markdown"
    if lower.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


def _legacy_files_from_content(content: str) -> list[tuple[str, str]]:
    value = str(content or "")
    found: list[tuple[str, str]] = []

    for name in re.findall(r"(?:^|\n)Attached PDF:\s*([^\n(]+)", value):
        filename = str(name).strip()
        if filename:
            found.append((filename, "application/pdf"))

    for name, mime in re.findall(r"(?:^|\n)Attached file:\s*([^\n(]+)\(([^)]+)\)", value):
        filename = str(name).strip()
        mime_type = str(mime).strip() or "application/octet-stream"
        if filename:
            found.append((filename, mime_type))

    for name in re.findall(r"(?:^|\n)Attached file:\s*([^\n(]+)", value):
        filename = str(name).strip()
        if filename and not any(existing_name == filename for existing_name, _ in found):
            found.append((filename, _guess_mime_from_name(filename)))

    return found


def _conversation_date_from_value(value) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        else:
            value = value.astimezone(timezone.utc)
        return value.date().isoformat()

    text = str(value or "").strip()
    if not text:
        return ""

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return text[:10]

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.date().isoformat()


async def ensure_ai_session_image_assets(user_id: str) -> int:
    """Backfill file_assets for AI chat attachments stored inside session messages."""
    created = 0
    cursor = ai_session_repo.find_cursor_for_user(
        user_id,
        projection={"_id": 1, "messages": 1, "createdAt": 1, "updatedAt": 1},
    )
    if cursor is None:
        return created

    async for session in cursor:
        session_id = str(session.get("_id"))
        messages = list(session.get("messages") or [])
        for msg_idx, message in enumerate(messages):
            created_at = message.get("createdAt") or session.get("updatedAt") or session.get("createdAt")
            conversation_date = _conversation_date_from_value(created_at)

            created += await _backfill_images(
                session_id=session_id,
                user_id=user_id,
                msg_idx=msg_idx,
                message=message,
                conversation_date=conversation_date,
            )
            created += await _backfill_files(
                session_id=session_id,
                user_id=user_id,
                msg_idx=msg_idx,
                message=message,
                conversation_date=conversation_date,
            )
            created += await _backfill_legacy_content_files(
                session_id=session_id,
                user_id=user_id,
                msg_idx=msg_idx,
                message=message,
                conversation_date=conversation_date,
            )

    return created


async def _backfill_images(
    *,
    session_id: str,
    user_id: str,
    msg_idx: int,
    message: dict,
    conversation_date: str,
) -> int:
    created = 0
    for img_idx, base64_data in enumerate(list((message or {}).get("images") or [])):
        if not base64_data:
            continue
        file_id = f"aiimg_{session_id}_{msg_idx}_{img_idx}"
        exists = await file_asset_repo.find_asset_by_file_id(file_id)
        if exists:
            continue
        now = utcnow()
        await file_asset_repo.insert_asset(
            {
                "file_id": file_id,
                "file_type": "ai_chat_attachment",
                "storage_path": f"mongo://ai_chat_sessions/{session_id}/messages/{msg_idx}/images/{img_idx}",
                "size": len(str(base64_data or "")),
                "owner_type": "ai_chat_session",
                "owner_id": session_id,
                "course_id": "",
                "filename": f"ai_image_{msg_idx}_{img_idx}.b64",
                "mime_type": "image/base64",
                "checksum": "",
                "public_url": "",
                "scope": "ai_personal",
                "room_id": "",
                "user_id": str(user_id),
                "session_id": session_id,
                "conversation_date": conversation_date,
                "created_by": str(user_id),
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
                "status": "active",
                "metadata": {
                    "message_index": msg_idx,
                    "image_index": img_idx,
                    "source": "ai_chat_sessions",
                },
            }
        )
        created += 1
    return created


async def _backfill_files(
    *,
    session_id: str,
    user_id: str,
    msg_idx: int,
    message: dict,
    conversation_date: str,
) -> int:
    created = 0
    for file_idx, item in enumerate(list((message or {}).get("files") or [])):
        if not isinstance(item, dict):
            continue
        file_name = str(item.get("file_name") or "").strip()
        if not file_name:
            continue
        mime_type = str(item.get("mime_type") or "").strip() or _guess_mime_from_name(file_name)
        file_id = f"aifile_{session_id}_{msg_idx}_{file_idx}"
        exists = await file_asset_repo.find_asset_by_file_id(file_id)
        if exists:
            continue
        now = utcnow()
        await file_asset_repo.insert_asset(
            {
                "file_id": file_id,
                "file_type": "ai_chat_attachment",
                "storage_path": f"mongo://ai_chat_sessions/{session_id}/messages/{msg_idx}/files/{file_idx}",
                "size": len(file_name),
                "owner_type": "ai_chat_session",
                "owner_id": session_id,
                "course_id": "",
                "filename": file_name,
                "mime_type": mime_type,
                "checksum": "",
                "public_url": "",
                "scope": "ai_personal",
                "room_id": "",
                "user_id": str(user_id),
                "session_id": session_id,
                "conversation_date": conversation_date,
                "created_by": str(user_id),
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
                "status": "active",
                "metadata": {
                    "message_index": msg_idx,
                    "file_index": file_idx,
                    "source": "ai_chat_sessions.files",
                },
            }
        )
        created += 1
    return created


async def _backfill_legacy_content_files(
    *,
    session_id: str,
    user_id: str,
    msg_idx: int,
    message: dict,
    conversation_date: str,
) -> int:
    created = 0
    for legacy_idx, (file_name, mime_type) in enumerate(_legacy_files_from_content(message.get("content") or "")):
        file_id = f"aifile_legacy_{session_id}_{msg_idx}_{legacy_idx}"
        exists = await file_asset_repo.find_asset_by_file_id(file_id)
        if exists:
            continue
        now = utcnow()
        await file_asset_repo.insert_asset(
            {
                "file_id": file_id,
                "file_type": "ai_chat_attachment",
                "storage_path": f"mongo://ai_chat_sessions/{session_id}/messages/{msg_idx}/legacy_files/{legacy_idx}",
                "size": len(file_name),
                "owner_type": "ai_chat_session",
                "owner_id": session_id,
                "course_id": "",
                "filename": file_name,
                "mime_type": mime_type,
                "checksum": "",
                "public_url": "",
                "scope": "ai_personal",
                "room_id": "",
                "user_id": str(user_id),
                "session_id": session_id,
                "conversation_date": conversation_date,
                "created_by": str(user_id),
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
                "status": "active",
                "metadata": {
                    "message_index": msg_idx,
                    "file_index": legacy_idx,
                    "source": "ai_chat_sessions.legacy_content",
                },
            }
        )
        created += 1
    return created
