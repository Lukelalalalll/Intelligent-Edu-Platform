"""Database browser / console endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.config import Config
from backend.core.database import db
from backend.core.security import get_admin_user, require_step_up
from backend.schemas import AdminDbDocumentSchema
from backend.services.admin.admin_query_service import build_admin_collection_search_filter
from backend.services.auth.security_audit import record_security_event
from .router import (
    _check_collection_read_access,
    _check_db_console_enabled,
    _check_write_access,
    _parse_document_object_id,
    _serialize_mongo_value,
    _validate_collection_name,
)

router = APIRouter()


async def _audit_db_console(
    *,
    admin: dict,
    action: str,
    collection_name: str | None = None,
    document_id: str | None = None,
) -> None:
    extra = {}
    if collection_name:
        extra["collection_name"] = collection_name
    if document_id:
        extra["document_id"] = document_id
    await record_security_event(
        level="warning" if action.endswith(("_created", "_updated", "_deleted")) else "info",
        request_id="unknown",
        user_id=str(admin.get("_id") or admin.get("id") or ""),
        endpoint="/api/admin/db",
        action=action,
        detail="administrator accessed DB console",
        extra=extra,
    )


@router.get("/db/collections")
async def list_db_collections(admin: dict = Depends(get_admin_user)):
    _check_db_console_enabled()
    names = await db.list_collection_names()
    visible = [name for name in names if not name.startswith("system.")]
    allowed = {str(item).strip() for item in Config.ADMIN_DB_CONSOLE_ALLOWED_COLLECTIONS if str(item).strip()}
    if allowed:
        visible = [name for name in visible if name in allowed]
    stats = []
    for name in sorted(visible):
        count = await db[name].count_documents({})
        stats.append({"name": name, "count": count})
    await _audit_db_console(admin=admin, action="admin_db_collections_listed")
    return {"collections": stats}


@router.get("/db/{collection_name}/documents")
async def list_db_documents(
    collection_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=120),
    admin: dict = Depends(get_admin_user),
):
    _check_db_console_enabled()
    collection_name = _validate_collection_name(collection_name)
    _check_collection_read_access(collection_name)
    coll = db[collection_name]
    keyword = (q or "").strip()
    filter_query = build_admin_collection_search_filter(collection_name, keyword)

    total = await coll.count_documents(filter_query)
    cursor = coll.find(filter_query)
    if collection_name == "users":
        cursor = cursor.sort([("role", 1), ("username", 1)])
    docs = await cursor.skip(skip).limit(limit).to_list(length=limit)
    await _audit_db_console(
        admin=admin,
        action="admin_db_documents_listed",
        collection_name=collection_name,
    )
    return {
        "total": total,
        "documents": [_serialize_mongo_value(doc) for doc in docs],
    }


@router.post("/db/{collection_name}/documents")
async def create_db_document(
    collection_name: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
    _step_up: dict = Depends(require_step_up),
):
    _check_db_console_enabled()
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    doc = dict(req.document or {})
    doc.pop("_id", None)

    result = await db[collection_name].insert_one(doc)
    created = await db[collection_name].find_one({"_id": result.inserted_id})
    await _audit_db_console(
        admin=admin,
        action="admin_db_document_created",
        collection_name=collection_name,
        document_id=str(result.inserted_id),
    )
    return {"message": "Document created", "document": _serialize_mongo_value(created)}


@router.put("/db/{collection_name}/documents/{document_id}")
async def update_db_document(
    collection_name: str,
    document_id: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
    _step_up: dict = Depends(require_step_up),
):
    _check_db_console_enabled()
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    document_oid = _parse_document_object_id(document_id)

    replacement = dict(req.document or {})
    replacement.pop("_id", None)

    result = await db[collection_name].replace_one({"_id": document_oid}, replacement)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    updated = await db[collection_name].find_one({"_id": document_oid})
    await _audit_db_console(
        admin=admin,
        action="admin_db_document_updated",
        collection_name=collection_name,
        document_id=document_id,
    )
    return {"message": "Document updated", "document": _serialize_mongo_value(updated)}


@router.delete("/db/{collection_name}/documents/{document_id}")
async def delete_db_document(
    collection_name: str,
    document_id: str,
    admin: dict = Depends(get_admin_user),
    _step_up: dict = Depends(require_step_up),
):
    _check_db_console_enabled()
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    document_oid = _parse_document_object_id(document_id)

    result = await db[collection_name].delete_one({"_id": document_oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    await _audit_db_console(
        admin=admin,
        action="admin_db_document_deleted",
        collection_name=collection_name,
        document_id=document_id,
    )
    return {"message": "Document deleted"}
