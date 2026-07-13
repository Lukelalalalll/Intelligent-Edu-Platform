"""Grade repository CRUD for the grades collection."""
from __future__ import annotations

from typing import Any

from backend.core.database import db

from ._helpers import serialize_doc, utcnow


async def upsert_grade(
    submission_id: str,
    grader_id: str,
    data: dict[str, Any],
    *,
    session=None,
) -> dict[str, Any]:
    data.pop("_id", None)
    now = utcnow()
    data["submissionId"] = submission_id
    data["graderId"] = grader_id
    data.setdefault("gradedAt", now)
    data.setdefault("gradingStatus", "draft")
    data["updatedAt"] = now

    await db.grades.update_one(
        {"submissionId": submission_id},
        {"$set": data, "$setOnInsert": {"createdAt": now}},
        upsert=True,
        session=session,
    )
    doc = await db.grades.find_one({"submissionId": submission_id}, session=session)
    return serialize_doc(doc)


async def get_grade(submission_id: str, *, session=None) -> dict[str, Any] | None:
    doc = await db.grades.find_one({"submissionId": submission_id}, session=session)
    if doc:
        return serialize_doc(doc)
    return None
