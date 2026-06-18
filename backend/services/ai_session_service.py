from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from backend.repositories import ai_session_repo
from backend.schemas import UpdateAiSessionSchema
from backend.services.chat_service.session_bucket_service import (
    append_messages_bucketed,
    delete_session_buckets,
    load_all_messages,
    save_messages_bucketed,
)
from backend.services.file_asset_service import ensure_ai_session_image_assets
from backend.services.llm_service.ai_session_service import sanitize_session_update_payload
from backend.services.security_audit import log_security_event

DEFAULT_TITLE = "New Conversation"
ERR_INVALID_ID = "Invalid session id"
ERR_NOT_FOUND = "Session not found"
ERR_FORBIDDEN = "Not your session"
SESSION_PREVIEW_LIMIT = 12

logger = logging.getLogger(__name__)


def _clone_jsonish(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _clone_jsonish(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clone_jsonish(item) for item in value]
    return value


def _get_session_oid(session_id: str) -> ObjectId:
    oid = ai_session_repo.session_oid(session_id)
    if oid is None:
        raise HTTPException(status_code=400, detail=ERR_INVALID_ID)
    return oid


async def _load_session_doc(session_id: str) -> tuple[ObjectId, dict[str, Any]]:
    session_oid = _get_session_oid(session_id)
    doc = await ai_session_repo.find_by_id(session_oid)
    if not doc:
        raise HTTPException(status_code=404, detail=ERR_NOT_FOUND)
    return session_oid, doc


def _assert_session_owner(
    doc: dict[str, Any],
    *,
    user_id: str,
    request_id: str | None = None,
    endpoint: str | None = None,
    action: str | None = None,
) -> None:
    if str(doc.get("userId")) == user_id:
        return

    if request_id and endpoint and action:
        log_security_event(
            level="warning",
            request_id=request_id,
            user_id=user_id,
            endpoint=endpoint,
            action=action,
            detail="session ownership mismatch",
        )
    raise HTTPException(status_code=403, detail=ERR_FORBIDDEN)


def _serialize_session_summary(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "clientId": doc.get("clientId", ""),
        "title": doc.get("title", DEFAULT_TITLE),
        "createdAt": doc.get("createdAt", ""),
        "updatedAt": doc.get("updatedAt", ""),
        "messageCount": int(doc.get("messageCount", len(doc.get("messages", []) or [])) or 0),
        "hasMoreMessages": bool(doc.get("bucketCount", 0)),
        "previewMessages": [
            _serialize_session_message(item)
            for item in (doc.get("messages", []) or [])[:SESSION_PREVIEW_LIMIT]
        ],
    }


def _serialize_session_message(item: dict[str, Any]) -> dict[str, Any]:
    message = {
        "role": item.get("role", ""),
        "content": item.get("content", ""),
    }

    optional_fields = (
        "reasoning",
        "is_course_relevant",
        "images",
        "files",
        "citations",
        "ui_elements",
        "tool_progresses",
    )
    for field in optional_fields:
        value = item.get(field)
        if value in (None, "", [], {}):
            continue
        message[field] = _clone_jsonish(value)

    return message


def _messages_match_prefix(existing: list[dict[str, Any]], incoming: list[dict[str, Any]], prefix_len: int) -> bool:
    if prefix_len < 0 or prefix_len > len(existing):
        return False
    if prefix_len > len(incoming):
        return False
    for idx in range(prefix_len):
        if _serialize_session_message(existing[idx]) != _serialize_session_message(incoming[idx]):
            return False
    return True


def _slice_tail_messages(messages: list[dict[str, Any]], limit: int | None = None) -> tuple[list[dict[str, Any]], int]:
    safe_limit = max(1, int(limit or SESSION_PREVIEW_LIMIT))
    start = max(0, len(messages) - safe_limit)
    return messages[start:], start


async def list_sessions_for_user(user_id: str) -> list[dict[str, Any]]:
    docs = await ai_session_repo.list_for_user(
        user_id,
        projection={"messages": 1, "bucketCount": 1, "messageCount": 1, "title": 1, "createdAt": 1, "updatedAt": 1, "clientId": 1},
    )
    return [_serialize_session_summary(doc) for doc in docs]


async def create_session_for_user(*, user_id: str, system_content: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    doc = {
        "userId": ObjectId(user_id),
        "clientId": "",
        "title": DEFAULT_TITLE,
        "messages": [{"role": "system", "content": system_content, "createdAt": now}],
        "createdAt": now,
        "updatedAt": now,
        "revision": 0,
    }
    result = await ai_session_repo.insert_session(doc)
    return {
        "id": str(result.inserted_id),
        "title": doc["title"],
        "messages": [{"role": "system", "content": system_content}],
        "createdAt": now,
        "updatedAt": now,
        "revision": 0,
        "messageCount": 1,
        "hasMoreMessages": False,
    }


async def update_session_for_user(
    *,
    session_id: str,
    payload: UpdateAiSessionSchema,
    user: dict[str, Any],
    request_id: str,
    idempotency_key: str,
) -> dict[str, Any]:
    endpoint = f"/api/ai/sessions/{session_id}"
    user_id = str(user.get("id") or "")

    session_oid, existing = await _load_session_doc(session_id)
    _assert_session_owner(
        existing,
        user_id=user_id,
        request_id=request_id,
        endpoint=endpoint,
        action="update_session_forbidden",
    )

    if idempotency_key and existing.get("lastIdempotencyKey") == idempotency_key:
        log_security_event(
            level="info",
            request_id=request_id,
            user_id=user_id,
            endpoint=endpoint,
            action="update_session_idempotent_replay",
            detail="duplicate idempotency key ignored",
        )
        return {"ok": True, "idempotent": True}

    try:
        sanitized = sanitize_session_update_payload(payload)
    except ValueError as exc:
        log_security_event(
            level="warning",
            request_id=request_id,
            user_id=user_id,
            endpoint=endpoint,
            action="update_session_rejected",
            detail=str(exc)[:240],
        )
        raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.now(timezone.utc)
    update_fields: dict[str, Any] = {"updatedAt": now, **sanitized}
    if idempotency_key:
        update_fields["lastIdempotencyKey"] = idempotency_key
    update_fields["lastWriterUserId"] = user_id
    update_fields["lastWriteRequestId"] = request_id

    if "messages" in update_fields:
        history_start = int(update_fields.pop("history_start", 0) or 0)
        inline_messages = list(existing.get("messages", []) or [])
        existing_messages = (
            await load_all_messages(session_id, inline_messages)
            if int(existing.get("bucketCount", 0) or 0) > 0
            else inline_messages
        )
        incoming_messages = list(update_fields["messages"])
        can_append = (
            history_start >= len(existing_messages)
            or (
                history_start >= 0
                and history_start <= len(existing_messages)
                and _messages_match_prefix(existing_messages, existing_messages[:history_start], history_start)
                and history_start == len(existing_messages)
            )
        )
        merged_messages = existing_messages[:history_start] + incoming_messages
        if can_append and history_start == len(existing_messages):
            bucket_result = await append_messages_bucketed(
                session_id,
                incoming_messages,
                existing_inline_messages=inline_messages,
                existing_bucket_count=int(existing.get("bucketCount", 0) or 0),
            )
        else:
            bucket_result = await save_messages_bucketed(session_id, merged_messages)
        update_fields["messages"] = bucket_result["inline_messages"]
        update_fields["bucketCount"] = bucket_result["bucket_count"]
        update_fields["messageCount"] = len(merged_messages)
        update_fields.pop("history_start", None)

    try:
        current_revision = int(existing.get("revision", 0) or 0)
    except (TypeError, ValueError):
        current_revision = 0
    update_fields["revision"] = current_revision + 1

    result = await ai_session_repo.update_with_revision(
        session_id=session_oid,
        current_revision=current_revision,
        update_fields=update_fields,
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Session modified concurrently - please reload and try again")

    if "messages" in update_fields:
        try:
            await ensure_ai_session_image_assets(str(user.get("_id") or user.get("id") or ""))
        except Exception:
            logger.exception("Failed to sync AI image assets for user=%s", user_id)

    return {"ok": True}


async def delete_session_for_user(*, session_id: str, user_id: str) -> None:
    session_oid, existing = await _load_session_doc(session_id)
    _assert_session_owner(existing, user_id=user_id)

    await ai_session_repo.delete_session(session_oid)
    await delete_session_buckets(session_id)


async def get_session_for_user(*, session_id: str, user_id: str, limit: int | None = None) -> dict[str, Any]:
    _, doc = await _load_session_doc(session_id)
    _assert_session_owner(doc, user_id=user_id)

    inline_messages = doc.get("messages", [])
    all_messages = (
        await load_all_messages(session_id, inline_messages)
        if doc.get("bucketCount", 0) > 0
        else inline_messages
    )

    selected_messages, history_start = _slice_tail_messages(all_messages, limit)
    messages = [_serialize_session_message(item) for item in selected_messages]

    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", DEFAULT_TITLE),
        "messages": messages,
        "createdAt": doc.get("createdAt", ""),
        "updatedAt": doc.get("updatedAt", ""),
        "messageCount": int(doc.get("messageCount", len(all_messages)) or len(all_messages)),
        "hasMoreMessages": history_start > 0,
        "historyStart": history_start,
        "pageSize": len(messages),
    }


async def get_session_preview_for_user(*, session_id: str, user_id: str, limit: int = SESSION_PREVIEW_LIMIT) -> dict[str, Any]:
    _, doc = await _load_session_doc(session_id)
    _assert_session_owner(doc, user_id=user_id)

    inline_messages = doc.get("messages", [])
    all_messages = (
        await load_all_messages(session_id, inline_messages)
        if int(doc.get("bucketCount", 0) or 0) > 0
        else inline_messages
    )
    preview, history_start = _slice_tail_messages(all_messages, limit)
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", DEFAULT_TITLE),
        "messages": [_serialize_session_message(item) for item in preview],
        "createdAt": doc.get("createdAt", ""),
        "updatedAt": doc.get("updatedAt", ""),
        "messageCount": int(doc.get("messageCount", len(all_messages)) or len(all_messages)),
        "hasMoreMessages": history_start > 0,
        "historyStart": history_start,
        "previewLimit": limit,
    }


def normalize_chat_messages(messages: list[dict], limit: int = 100) -> list[dict]:
    cleaned: list[dict] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip().lower()
        if role not in {"user", "assistant", "system"}:
            continue
        content = str(item.get("content", "") or "").strip()
        images = item.get("images", [])
        if role in {"user", "assistant"} and not content and not images:
            continue
        msg = {"role": role, "content": content}
        if images:
            msg["images"] = images
        cleaned.append(msg)
    return cleaned[-max(1, int(limit)) :]


def is_same_message(a: dict, b: dict) -> bool:
    return (
        str(a.get("role", "")) == str(b.get("role", ""))
        and str(a.get("content", "")) == str(b.get("content", ""))
    )


async def hydrate_request_messages_from_session(
    *,
    session_id: str,
    user_id: str,
    request_messages: list[dict],
) -> tuple[list[dict], bool]:
    session_id = str(session_id or "").strip()
    if not session_id:
        return request_messages, False

    doc = await ai_session_repo.find_by_id(session_id)
    if not doc:
        raise HTTPException(status_code=404, detail=ERR_NOT_FOUND)
    if str(doc.get("userId", "")) != user_id:
        raise HTTPException(status_code=403, detail="Session access denied")

    inline = doc.get("messages", [])
    if int(doc.get("bucketCount", 0) or 0) > 0:
        session_messages = await load_all_messages(session_id, inline)
    else:
        session_messages = inline

    normalized_session = normalize_chat_messages(session_messages)
    normalized_request = normalize_chat_messages(request_messages)
    if not normalized_session:
        return normalized_request, False

    if len(normalized_request) >= max(4, len(normalized_session) - 2):
        return normalized_request, False

    merged = list(normalized_session)
    latest_request_user = None
    for msg in reversed(normalized_request):
        if str(msg.get("role", "")).lower() == "user":
            latest_request_user = msg
            break

    if latest_request_user and (not merged or not is_same_message(merged[-1], latest_request_user)):
        merged.append(latest_request_user)

    return normalize_chat_messages(merged), True
