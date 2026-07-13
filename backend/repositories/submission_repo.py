"""Submission repository CRUD for the submissions collection."""
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


async def create_submission(
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any]:
    data.pop("_id", None)
    now = utcnow()
    data.setdefault("status", "pending")
    data.setdefault("submittedAt", now)
    data.setdefault("createdAt", data["submittedAt"])
    data["updatedAt"] = now
    data.setdefault("attemptNo", 1)
    result = await db.submissions.insert_one(data, session=session)
    doc = await db.submissions.find_one({"_id": result.inserted_id}, session=session)
    return serialize_doc(doc)


async def get_submission(submission_id: str, *, session=None) -> dict[str, Any] | None:
    oid = coerce_object_id(submission_id)
    if oid is None:
        return None
    doc = await db.submissions.find_one({"_id": oid}, session=session)
    if doc:
        return serialize_doc(doc)
    return None


async def list_submissions(
    assignment_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    session=None,
) -> dict[str, Any]:
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    query = {"assignmentId": assignment_id}
    skip = (safe_page - 1) * safe_page_size
    total = await db.submissions.count_documents(query, session=session)
    docs = await (
        db.submissions.find(query, session=session)
        .sort([("submittedAt", -1), ("createdAt", -1)])
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


async def list_submissions_for_student(
    student_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    session=None,
) -> dict[str, Any]:
    safe_page, safe_page_size = normalize_pagination(page=page, page_size=page_size)
    query = {"studentId": student_id}
    skip = (safe_page - 1) * safe_page_size
    total = await db.submissions.count_documents(query, session=session)
    docs = await (
        db.submissions.find(query, session=session)
        .sort([("submittedAt", -1), ("createdAt", -1)])
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


async def update_submission(
    submission_id: str,
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any] | None:
    oid = coerce_object_id(submission_id)
    if oid is None:
        return None
    data.pop("_id", None)
    data["updatedAt"] = utcnow()
    await db.submissions.update_one({"_id": oid}, {"$set": data}, session=session)
    return await get_submission(submission_id, session=session)
