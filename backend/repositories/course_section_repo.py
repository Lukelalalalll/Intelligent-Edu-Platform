"""Course section repository CRUD for the course_sections collection."""
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


async def create_course_section(
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any]:
    data.pop("_id", None)
    now = utcnow()
    data.setdefault("createdAt", now)
    data["updatedAt"] = now
    result = await db.course_sections.insert_one(data, session=session)
    doc = await db.course_sections.find_one({"_id": result.inserted_id}, session=session)
    return serialize_doc(doc)


async def get_course_section(section_id: str, *, session=None) -> dict[str, Any] | None:
    oid = coerce_object_id(section_id)
    if oid is None:
        return None
    doc = await db.course_sections.find_one({"_id": oid}, session=session)
    if doc:
        return serialize_doc(doc)
    return None


async def list_course_sections(
    filter_query: dict[str, Any] | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
    session=None,
) -> dict[str, Any]:
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    query = filter_query or {}
    skip = (safe_page - 1) * safe_page_size
    total = await db.course_sections.count_documents(query, session=session)
    docs = await (
        db.course_sections.find(query, session=session)
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


async def update_course_section(
    section_id: str,
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any] | None:
    oid = coerce_object_id(section_id)
    if oid is None:
        return None
    data.pop("_id", None)
    data["updatedAt"] = utcnow()
    await db.course_sections.update_one({"_id": oid}, {"$set": data}, session=session)
    return await get_course_section(section_id, session=session)


async def delete_course_section(section_id: str, *, session=None) -> bool:
    oid = coerce_object_id(section_id)
    if oid is None:
        return False
    result = await db.course_sections.delete_one({"_id": oid}, session=session)
    return result.deleted_count > 0
