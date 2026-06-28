from __future__ import annotations

from typing import Any

from backend.core.database import db
from ._helpers import coerce_object_id


async def insert_homework(document: dict[str, Any]):
    return await db.homeworks.insert_one(document)


async def list_homeworks(
    filt: dict[str, Any],
    *,
    sort: list[tuple[str, int]] | None = None,
) -> list[dict[str, Any]]:
    cursor = db.homeworks.find(filt)
    if sort:
        cursor = cursor.sort(sort)
    return [doc async for doc in cursor]


async def find_homework_by_id(homework_id: str) -> dict[str, Any] | None:
    oid = coerce_object_id(homework_id)
    if oid is None:
        return None
    return await db.homeworks.find_one({"_id": oid})


async def list_student_course_ids(student_id: str) -> list[str]:
    cursor = db.courses.find({"students": student_id}, {"_id": 1})
    return [str(doc["_id"]) async for doc in cursor]


async def insert_submission(document: dict[str, Any]):
    return await db.homework_submissions.insert_one(document)


async def list_submissions_by_student(student_id: str) -> list[dict[str, Any]]:
    return [doc async for doc in db.homework_submissions.find({"student_id": student_id})]
