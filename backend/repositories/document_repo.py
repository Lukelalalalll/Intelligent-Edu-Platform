"""Document repository CRUD for the documents collection."""
from __future__ import annotations

from typing import Any

from backend.core.database import db

from ._helpers import (
    build_page_result,
    coerce_object_id,
    normalize_pagination,
    serialize_doc,
    serialize_docs,
    utcnow,
)


async def create_document(
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any]:
    data.pop("_id", None)
    now = utcnow()
    data.setdefault("createdAt", now)
    data["updatedAt"] = now
    result = await db.documents.insert_one(data, session=session)
    doc = await db.documents.find_one({"_id": result.inserted_id}, session=session)
    return serialize_doc(doc)


async def get_document(document_id: str, *, session=None) -> dict[str, Any] | None:
    oid = coerce_object_id(document_id)
    if oid is None:
        return None
    doc = await db.documents.find_one({"_id": oid}, session=session)
    if doc:
        return serialize_doc(doc)
    return None


async def set_document_owner(
    document_id: str,
    owner_id: str,
    *,
    session=None,
) -> bool:
    oid = coerce_object_id(document_id)
    if oid is None:
        return False
    result = await db.documents.update_one(
        {"_id": oid},
        {"$set": {"ownerId": owner_id, "updatedAt": utcnow()}},
        session=session,
    )
    return result.matched_count > 0


async def list_documents(
    owner_id: str,
    source_type: str | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
    session=None,
) -> dict[str, Any]:
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    query: dict[str, Any] = {"ownerId": owner_id}
    if source_type:
        query["sourceType"] = source_type
    skip = (safe_page - 1) * safe_page_size
    total = await db.documents.count_documents(query, session=session)
    docs = await (
        db.documents.find(query, session=session)
        .sort([("updatedAt", -1), ("createdAt", -1)])
        .skip(skip)
        .limit(safe_page_size)
        .to_list(length=safe_page_size)
    )
    return build_page_result(
        items=serialize_docs(docs),
        total=total,
        page=safe_page,
        page_size=safe_page_size,
    )
