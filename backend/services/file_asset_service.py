from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import re

from bson import ObjectId
from pymongo import ReturnDocument

from backend.config import Config
from backend.core.database import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [_to_iso(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_iso(v) for k, v in value.items()}
    return value


def _normalize_path(storage_path: str) -> str:
    return str(storage_path or "").replace("\\", "/").strip()


def _absolute_from_storage_path(storage_path: str) -> Path:
    rel = _normalize_path(storage_path).lstrip("/")
    return Path(Config.BASE_DIR) / rel


async def register_file_asset(
    *,
    file_type: str,
    storage_path: str,
    size: int,
    owner_type: str,
    owner_id: str,
    created_by: str,
    filename: str = "",
    mime_type: str = "",
    checksum: str = "",
    course_id: str = "",
    public_url: str = "",
    scope: str = "",
    room_id: str = "",
    user_id: str = "",
    session_id: str = "",
    conversation_date: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _utcnow()
    doc = {
        "file_id": str(uuid.uuid4()),
        "file_type": file_type,
        "storage_path": _normalize_path(storage_path),
        "size": int(size or 0),
        "owner_type": owner_type,
        "owner_id": str(owner_id or ""),
        "course_id": str(course_id or ""),
        "filename": str(filename or ""),
        "mime_type": str(mime_type or ""),
        "checksum": str(checksum or ""),
        "public_url": str(public_url or ""),
        "scope": str(scope or ""),
        "room_id": str(room_id or ""),
        "user_id": str(user_id or ""),
        "session_id": str(session_id or ""),
        "conversation_date": str(conversation_date or ""),
        "created_by": str(created_by or ""),
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "status": "active",
        "metadata": metadata or {},
    }
    await db.file_assets.insert_one(doc)
    return _to_iso(doc)


async def ensure_ai_session_image_assets(user_id: str) -> int:
    """Backfill file_assets for attachments embedded in ai_chat_sessions messages.

    This keeps the existing function name for compatibility with callers, but it now
    backfills both image attachments and non-image file metadata (pdf/pptx/md/etc.)
    so the Admin File Center can list personal AI chat files reliably.
    """
    created = 0
    if not ObjectId.is_valid(str(user_id or "")):
        return created

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
        """Extract legacy attachment labels from message content.

        Old messages stored plain text lines like:
        - Attached PDF: name.pdf
        - Attached file: slides.pptx (mime/type)
        """
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

        # Fallback for lines without explicit mime parenthesis.
        for name in re.findall(r"(?:^|\n)Attached file:\s*([^\n(]+)", value):
            filename = str(name).strip()
            if filename:
                already = any(existing_name == filename for existing_name, _ in found)
                if not already:
                    found.append((filename, _guess_mime_from_name(filename)))

        return found

    cursor = db.ai_chat_sessions.find({"userId": ObjectId(user_id)})
    async for sess in cursor:
        session_id = str(sess.get("_id"))
        messages = list(sess.get("messages") or [])
        for msg_idx, msg in enumerate(messages):
            images = list((msg or {}).get("images") or [])
            created_at = msg.get("createdAt") or sess.get("updatedAt") or sess.get("createdAt")
            conv_date = ""
            if isinstance(created_at, datetime):
                conv_date = created_at.date().isoformat()
            elif created_at:
                conv_date = str(created_at)[:10]

            for img_idx, base64_data in enumerate(images):
                if not base64_data:
                    continue
                file_id = f"aiimg_{session_id}_{msg_idx}_{img_idx}"
                exists = await db.file_assets.find_one({"file_id": file_id})
                if exists:
                    continue
                await db.file_assets.insert_one(
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
                        "conversation_date": conv_date,
                        "created_by": str(user_id),
                        "created_at": _utcnow(),
                        "updated_at": _utcnow(),
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

            files = list((msg or {}).get("files") or [])
            for file_idx, item in enumerate(files):
                if not isinstance(item, dict):
                    continue
                file_name = str(item.get("file_name") or "").strip()
                if not file_name:
                    continue
                mime_type = str(item.get("mime_type") or "").strip() or _guess_mime_from_name(file_name)
                file_id = f"aifile_{session_id}_{msg_idx}_{file_idx}"
                exists = await db.file_assets.find_one({"file_id": file_id})
                if exists:
                    continue
                await db.file_assets.insert_one(
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
                        "conversation_date": conv_date,
                        "created_by": str(user_id),
                        "created_at": _utcnow(),
                        "updated_at": _utcnow(),
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

            # Backfill legacy sessions where attachment labels were embedded in text content.
            for legacy_idx, (file_name, mime_type) in enumerate(_legacy_files_from_content(msg.get("content") or "")):
                file_id = f"aifile_legacy_{session_id}_{msg_idx}_{legacy_idx}"
                exists = await db.file_assets.find_one({"file_id": file_id})
                if exists:
                    continue
                await db.file_assets.insert_one(
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
                        "conversation_date": conv_date,
                        "created_by": str(user_id),
                        "created_at": _utcnow(),
                        "updated_at": _utcnow(),
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


async def find_by_owner(owner_type: str, owner_id: str) -> list[dict[str, Any]]:
    cursor = db.file_assets.find({
        "owner_type": owner_type,
        "owner_id": str(owner_id),
        "status": {"$ne": "hard_deleted"},
    }).sort("created_at", -1)
    return [_to_iso(item) async for item in cursor]


async def list_assets(
    *,
    file_type: str = "",
    status: str = "",
    owner_type: str = "",
    course_id: str = "",
    created_by: str = "",
    q: str = "",
    limit: int = 100,
    skip: int = 0,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if file_type:
        query["file_type"] = file_type
    if status:
        query["status"] = status
    if owner_type:
        query["owner_type"] = owner_type
    if course_id:
        query["course_id"] = course_id
    if created_by:
        query["created_by"] = created_by
    keyword = str(q or "").strip()
    if keyword:
        escaped = keyword.replace(".", "\\.")
        query["$or"] = [
            {"filename": {"$regex": escaped, "$options": "i"}},
            {"storage_path": {"$regex": escaped, "$options": "i"}},
            {"owner_id": {"$regex": escaped, "$options": "i"}},
            {"course_id": {"$regex": escaped, "$options": "i"}},
        ]

    total = await db.file_assets.count_documents(query)
    cursor = db.file_assets.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = [_to_iso(item) async for item in cursor]
    for doc in docs:
        path = _absolute_from_storage_path(doc.get("storage_path", ""))
        doc["exists_on_disk"] = path.is_file() or path.is_dir()
    return {"total": total, "assets": docs}


async def get_asset(asset_id: str) -> dict[str, Any] | None:
    query: dict[str, Any]
    if ObjectId.is_valid(asset_id):
        query = {"_id": ObjectId(asset_id)}
    else:
        query = {"file_id": asset_id}
    doc = await db.file_assets.find_one(query)
    if not doc:
        return None
    payload = _to_iso(doc)
    path = _absolute_from_storage_path(payload.get("storage_path", ""))
    payload["exists_on_disk"] = path.is_file() or path.is_dir()
    return payload


async def soft_delete_asset(asset_id: str, actor_id: str, reason: str = "") -> dict[str, Any] | None:
    now = _utcnow()
    result = await db.file_assets.find_one_and_update(
        {"file_id": asset_id, "status": {"$ne": "hard_deleted"}},
        {
            "$set": {
                "status": "soft_deleted",
                "deleted_at": now,
                "updated_at": now,
                "deleted_by": actor_id,
                "delete_reason": reason,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _to_iso(result) if result else None


async def restore_asset(asset_id: str, actor_id: str) -> dict[str, Any] | None:
    now = _utcnow()
    result = await db.file_assets.find_one_and_update(
        {"file_id": asset_id, "status": "soft_deleted"},
        {
            "$set": {
                "status": "active",
                "deleted_at": None,
                "updated_at": now,
                "restored_by": actor_id,
                "restored_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _to_iso(result) if result else None


async def check_references(asset: dict[str, Any]) -> dict[str, Any]:
    owner_type = str(asset.get("owner_type", ""))
    owner_id = str(asset.get("owner_id", ""))

    if owner_type == "chat_message":
        if ObjectId.is_valid(owner_id):
            exists = await db.chat_messages.find_one({"_id": ObjectId(owner_id)})
            return {"ok_to_delete": exists is None, "reason": "chat_message_reference" if exists else ""}
        return {"ok_to_delete": True, "reason": ""}

    if owner_type == "submission_document":
        if ObjectId.is_valid(owner_id):
            exists = await db.documents.find_one({"_id": ObjectId(owner_id)})
            return {"ok_to_delete": exists is None, "reason": "document_reference" if exists else ""}
        return {"ok_to_delete": True, "reason": ""}

    if owner_type == "knowledge_document":
        course_id = str(asset.get("course_id", ""))
        filename = str(asset.get("filename", ""))
        if course_id and filename:
            try:
                from backend.services.course_rag_service import course_rag_service

                indexed = course_rag_service.list_indexed_documents(course_id)
                still_indexed = any(str(item.get("doc_name", "")) == filename for item in indexed)
                return {
                    "ok_to_delete": not still_indexed,
                    "reason": "knowledge_doc_still_indexed" if still_indexed else "",
                }
            except Exception:
                return {"ok_to_delete": False, "reason": "knowledge_reference_check_failed"}
        return {"ok_to_delete": True, "reason": ""}

    if owner_type == "ai_chat_session":
        return {"ok_to_delete": True, "reason": ""}

    return {"ok_to_delete": True, "reason": ""}


async def hard_delete_asset(asset_id: str, actor_id: str) -> dict[str, Any] | None:
    asset = await db.file_assets.find_one({"file_id": asset_id})
    if not asset:
        return None

    ref = await check_references(asset)
    if not ref.get("ok_to_delete"):
        return {"blocked": True, "reason": ref.get("reason", "referenced")}

    now = _utcnow()
    path = _absolute_from_storage_path(asset.get("storage_path", ""))
    deleted_from_disk = False
    deleted_from_session = False
    if path.exists():
        if path.is_file():
            path.unlink(missing_ok=True)
            deleted_from_disk = True
        elif path.is_dir():
            # Only allow deleting course vectorstore directories.
            if str(asset.get("file_type", "")) == "knowledge_vectorstore":
                import shutil

                shutil.rmtree(path, ignore_errors=True)
                deleted_from_disk = True

    if str(asset.get("owner_type", "")) == "ai_chat_session":
        session_id = str(asset.get("session_id") or asset.get("owner_id") or "")
        meta = dict(asset.get("metadata") or {})
        msg_idx = meta.get("message_index")
        img_idx = meta.get("image_index")
        if ObjectId.is_valid(session_id) and isinstance(msg_idx, int) and isinstance(img_idx, int):
            sess = await db.ai_chat_sessions.find_one({"_id": ObjectId(session_id)})
            if sess:
                messages = list(sess.get("messages") or [])
                if 0 <= msg_idx < len(messages):
                    msg = dict(messages[msg_idx] or {})
                    images = list(msg.get("images") or [])
                    if 0 <= img_idx < len(images):
                        images[img_idx] = ""  # Set to empty instead of del to preserve other indices
                        msg["images"] = images
                        messages[msg_idx] = msg
                        await db.ai_chat_sessions.update_one(
                            {"_id": ObjectId(session_id)},
                            {"$set": {"messages": messages, "updatedAt": _utcnow()}},
                        )
                        deleted_from_session = True

    await db.file_assets.update_one(
        {"file_id": asset_id},
        {
            "$set": {
                "status": "hard_deleted",
                "updated_at": now,
                "hard_deleted_at": now,
                "hard_deleted_by": actor_id,
                "deleted_from_disk": deleted_from_disk,
                "deleted_from_session": deleted_from_session,
            }
        },
    )
    updated = await db.file_assets.find_one({"file_id": asset_id})
    return _to_iso(updated) if updated else None


async def run_audit() -> dict[str, Any]:
    orphan_disk_files: list[dict[str, Any]] = []
    dangling_registry: list[dict[str, Any]] = []

    base_dirs = [
        ("chat_attachment", Path(Config.BASE_DIR) / "static" / "chat_files"),
        ("submission_pdf", Path(Config.BASE_DIR) / "uploads" / "submissions"),
        ("knowledge_source", Path(Config.BASE_DIR) / "uploads" / "knowledge_base"),
    ]

    known_paths: set[str] = set()
    async for doc in db.file_assets.find({"status": {"$ne": "hard_deleted"}}, {"storage_path": 1, "file_id": 1, "file_type": 1}):
        p = _normalize_path(str(doc.get("storage_path", "")))
        if p:
            known_paths.add(p)

    for file_type, root in base_dirs:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(Path(Config.BASE_DIR)).as_posix()
            if rel not in known_paths:
                orphan_disk_files.append({"file_type": file_type, "storage_path": rel, "size": path.stat().st_size})

    async for doc in db.file_assets.find({"status": {"$ne": "hard_deleted"}}):
        rel = _normalize_path(str(doc.get("storage_path", "")))
        abs_path = Path(Config.BASE_DIR) / rel
        if not abs_path.exists():
            dangling_registry.append({
                "file_id": str(doc.get("file_id", "")),
                "file_type": str(doc.get("file_type", "")),
                "storage_path": rel,
            })

    return {
        "orphan_disk_files": orphan_disk_files,
        "dangling_registry": dangling_registry,
        "counts": {
            "orphan_disk_files": len(orphan_disk_files),
            "dangling_registry": len(dangling_registry),
        },
    }
