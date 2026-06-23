"""Database browser / console endpoints."""
from __future__ import annotations

from bson.objectid import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.database import db
from backend.core.security import get_admin_user
from backend.schemas import AdminDbDocumentSchema
from backend.services.admin.admin_query_service import build_admin_collection_search_filter
from .router import _check_write_access, _is_object_id, _serialize_mongo_value, _validate_collection_name

router = APIRouter()


@router.get("/db/collections")
async def list_db_collections(admin: dict = Depends(get_admin_user)):
    names = await db.list_collection_names()
    visible = [name for name in names if not name.startswith("system.")]
    stats = []
    for name in sorted(visible):
        count = await db[name].count_documents({})
        stats.append({"name": name, "count": count})
    return {"collections": stats}


@router.get("/db/{collection_name}/documents")
async def list_db_documents(
    collection_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=120),
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    coll = db[collection_name]
    keyword = (q or "").strip()
    filter_query = build_admin_collection_search_filter(collection_name, keyword)

    total = await coll.count_documents(filter_query)
    docs = await coll.find(filter_query).skip(skip).limit(limit).to_list(length=limit)
    return {
        "total": total,
        "documents": [_serialize_mongo_value(doc) for doc in docs],
    }


@router.post("/db/{collection_name}/documents")
async def create_db_document(
    collection_name: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    doc = dict(req.document or {})
    doc.pop("_id", None)

    result = await db[collection_name].insert_one(doc)
    created = await db[collection_name].find_one({"_id": result.inserted_id})
    return {"message": "Document created", "document": _serialize_mongo_value(created)}


@router.put("/db/{collection_name}/documents/{document_id}")
async def update_db_document(
    collection_name: str,
    document_id: str,
    req: AdminDbDocumentSchema,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    if not _is_object_id(document_id):
        raise HTTPException(status_code=400, detail="Invalid document id")

    replacement = dict(req.document or {})
    replacement.pop("_id", None)

    result = await db[collection_name].replace_one({"_id": ObjectId(document_id)}, replacement)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    updated = await db[collection_name].find_one({"_id": ObjectId(document_id)})
    return {"message": "Document updated", "document": _serialize_mongo_value(updated)}


@router.delete("/db/{collection_name}/documents/{document_id}")
async def delete_db_document(
    collection_name: str,
    document_id: str,
    admin: dict = Depends(get_admin_user),
):
    collection_name = _validate_collection_name(collection_name)
    _check_write_access(collection_name)
    if not _is_object_id(document_id):
        raise HTTPException(status_code=400, detail="Invalid document id")

    result = await db[collection_name].delete_one({"_id": ObjectId(document_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}

