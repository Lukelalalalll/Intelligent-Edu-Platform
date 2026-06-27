from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from bson import ObjectId

from backend.core.database import db


async def count_extra_legacy_homeworks(course_section_id: str, assignments: list[dict[str, Any]]) -> int:
    v2_homework_ids = {
        assignment.get("homeworkId")
        for assignment in assignments
        if assignment.get("homeworkId")
    }
    count = 0
    async for homework in db["homeworks"].find({"course_id": course_section_id}):
        if str(homework["_id"]) not in v2_homework_ids:
            count += 1
    return count


async def load_legacy_homework_submission_map(student_id: str) -> dict[str, dict[str, Any]]:
    submissions: dict[str, dict[str, Any]] = {}
    async for submission in db["homework_submissions"].find({"student_id": student_id}):
        submissions[str(submission["homework_id"])] = submission
    return submissions


async def load_legacy_homework(assignment_id: str) -> dict[str, Any] | None:
    if not ObjectId.is_valid(assignment_id):
        return None
    return await db["homeworks"].find_one({"_id": ObjectId(assignment_id)})


async def is_legacy_course_enrolled(*, user_id: str, course_section_id: str) -> bool:
    if not ObjectId.is_valid(course_section_id):
        return False

    section = await db.course_sections.find_one({"_id": ObjectId(course_section_id)})
    code = str((section or {}).get("courseCode", "")).strip()
    if not code:
        return False

    legacy_course = await db.courses.find_one({"id": code})
    if not legacy_course:
        return False

    student_ids = [
        str(student.get("studentId", "")).strip()
        for student in legacy_course.get("studentList", [])
        if isinstance(student, dict)
    ]
    return user_id in student_ids


async def upsert_legacy_submission(
    *,
    assignment_id: str,
    user_id: str,
    file_path: Path,
    filename: str,
) -> dict[str, Any]:
    existing = await db["homework_submissions"].find_one(
        {"homework_id": assignment_id, "student_id": user_id}
    )
    submitted_at = datetime.utcnow()
    if existing:
        await db["homework_submissions"].update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "file_path": str(file_path),
                    "file_name": filename,
                    "status": "submitted",
                    "submitted_at": submitted_at,
                }
            },
        )
        return {"id": str(existing["_id"]), "status": "submitted"}

    legacy_doc = {
        "homework_id": assignment_id,
        "student_id": user_id,
        "file_path": str(file_path),
        "file_name": filename,
        "status": "submitted",
        "submitted_at": submitted_at,
    }
    inserted = await db["homework_submissions"].insert_one(legacy_doc)
    return {"id": str(inserted.inserted_id), "status": "submitted"}


__all__ = [
    "count_extra_legacy_homeworks",
    "is_legacy_course_enrolled",
    "load_legacy_homework",
    "load_legacy_homework_submission_map",
    "upsert_legacy_submission",
]
