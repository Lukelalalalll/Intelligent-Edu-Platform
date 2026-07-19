from __future__ import annotations

import shutil
from typing import Any

from backend.core.database import db
from backend.repositories import ai_session_repo, chat_message_repo, file_asset_repo
from backend.repositories._helpers import coerce_object_id

from .shared import absolute_from_storage_path, to_iso, utcnow


async def soft_delete_asset(asset_id: str, actor_id: str, reason: str = "") -> dict | None:
    now = utcnow()
    result = await file_asset_repo.soft_delete_asset_by_file_id(
        file_id=asset_id,
        now=now,
        actor_id=actor_id,
        reason=reason,
    )
    return to_iso(result) if result else None


async def restore_asset(asset_id: str, actor_id: str) -> dict | None:
    now = utcnow()
    result = await file_asset_repo.restore_asset_by_file_id(
        file_id=asset_id,
        now=now,
        actor_id=actor_id,
    )
    return to_iso(result) if result else None


async def check_references(asset: dict) -> dict[str, Any]:
    owner_type = str(asset.get("owner_type", ""))
    owner_id = str(asset.get("owner_id", ""))
    owner_oid = coerce_object_id(owner_id)

    if owner_type == "chat_message":
        if owner_oid is not None:
            exists = await chat_message_repo.find_by_id(owner_oid)
            return {"ok_to_delete": exists is None, "reason": "chat_message_reference" if exists else ""}
        return {"ok_to_delete": True, "reason": ""}

    if owner_type == "submission_document":
        if owner_oid is not None:
            exists = await db.documents.find_one({"_id": owner_oid})
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


async def hard_delete_asset(asset_id: str, actor_id: str) -> dict | None:
    asset = await file_asset_repo.find_asset_by_file_id(asset_id)
    if not asset:
        return None

    references = await check_references(asset)
    if not references.get("ok_to_delete"):
        return {"blocked": True, "reason": references.get("reason", "referenced")}

    now = utcnow()
    path = absolute_from_storage_path(asset.get("storage_path", ""))
    deleted_from_disk = False
    deleted_from_session = False
    if path.exists():
        if path.is_file():
            path.unlink(missing_ok=True)
            deleted_from_disk = True
        elif path.is_dir() and str(asset.get("file_type", "")) == "knowledge_vectorstore":
            shutil.rmtree(path, ignore_errors=True)
            deleted_from_disk = True

    if str(asset.get("owner_type", "")) == "ai_chat_session":
        deleted_from_session = await _delete_ai_session_image(asset)

    updated = await file_asset_repo.mark_asset_hard_deleted(
        file_id=asset_id,
        now=now,
        actor_id=actor_id,
        deleted_from_disk=deleted_from_disk,
        deleted_from_session=deleted_from_session,
    )
    return to_iso(updated) if updated else None


async def _delete_ai_session_image(asset: dict) -> bool:
    session_id = str(asset.get("session_id") or asset.get("owner_id") or "")
    metadata = dict(asset.get("metadata") or {})
    msg_idx = metadata.get("message_index")
    img_idx = metadata.get("image_index")
    if coerce_object_id(session_id) is None or not (isinstance(msg_idx, int) and isinstance(img_idx, int)):
        return False

    session = await ai_session_repo.find_by_id(session_id)
    if not session:
        return False

    messages = list(session.get("messages") or [])
    if not (0 <= msg_idx < len(messages)):
        return False

    message = dict(messages[msg_idx] or {})
    images = list(message.get("images") or [])
    if not (0 <= img_idx < len(images)):
        return False

    images[img_idx] = ""
    message["images"] = images
    messages[msg_idx] = message
    await ai_session_repo.update_by_id(
        session_id,
        {"$set": {"messages": messages, "updatedAt": utcnow()}},
    )
    return True


async def soft_delete_course_source_assets(*, course_id: str, filename: str) -> None:
    now = utcnow()
    await file_asset_repo.soft_delete_knowledge_source_assets(
        course_id=course_id,
        filename=filename,
        now=now,
        reason="Removed from course index",
    )
