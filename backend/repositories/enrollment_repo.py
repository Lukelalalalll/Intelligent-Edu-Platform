"""Enrollment repository CRUD for the enrollments collection."""
from __future__ import annotations

from typing import Any

from backend.core.database import db

from ._helpers import (
    build_page_result,
    normalize_pagination,
    serialize_docs,
    utcnow,
)


async def enroll_user(
    course_section_id: str,
    user_id: str,
    role: str = "student",
    *,
    session=None,
) -> dict[str, Any]:
    now = utcnow()
    doc = {
        "courseSectionId": course_section_id,
        "userId": user_id,
        "roleInCourse": role,
        "updatedAt": now,
    }
    await db.enrollments.update_one(
        {"courseSectionId": course_section_id, "userId": user_id},
        {"$set": doc, "$setOnInsert": {"createdAt": now}},
        upsert=True,
        session=session,
    )
    return doc


async def unenroll_user(course_section_id: str, user_id: str, *, session=None) -> bool:
    result = await db.enrollments.delete_one(
        {"courseSectionId": course_section_id, "userId": user_id},
        session=session,
    )
    return result.deleted_count > 0


async def list_enrollments(
    course_section_id: str | None = None,
    user_id: str | None = None,
    *,
    page: int = 1,
    page_size: int = 20,
    session=None,
) -> dict[str, Any]:
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    query: dict[str, Any] = {}
    if course_section_id:
        query["courseSectionId"] = course_section_id
    if user_id:
        query["userId"] = user_id
    skip = (safe_page - 1) * safe_page_size
    total = await db.enrollments.count_documents(query, session=session)
    docs = await (
        db.enrollments.find(query, session=session)
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
