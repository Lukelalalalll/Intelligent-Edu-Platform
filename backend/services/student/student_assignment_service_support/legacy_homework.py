from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.core.database import db
from backend.repositories._helpers import coerce_object_id, utcnow


# Keep legacy homework/homework_submissions access isolated here so v2 student
# flows can fallback without spreading legacy collection queries back into the
# main service modules.
async def list_legacy_homeworks_by_course(course_section_id: str) -> list[dict[str, Any]]:
    homeworks: list[dict[str, Any]] = []
    cursor = db["homeworks"].find({"course_id": course_section_id}).sort("deadline", 1)
    async for homework in cursor:
        homeworks.append(homework)
    return homeworks


async def count_extra_legacy_homeworks(course_section_id: str, assignments: list[dict[str, Any]]) -> int:
    v2_homework_ids = {
        assignment.get("homeworkId")
        for assignment in assignments
        if assignment.get("homeworkId")
    }
    count = 0
    for homework in await list_legacy_homeworks_by_course(course_section_id):
        if str(homework["_id"]) not in v2_homework_ids:
            count += 1
    return count


async def load_legacy_homework_submission_map(student_id: str) -> dict[str, dict[str, Any]]:
    submissions: dict[str, dict[str, Any]] = {}
    async for submission in db["homework_submissions"].find({"student_id": student_id}):
        submissions[str(submission["homework_id"])] = submission
    return submissions


async def load_legacy_homework(assignment_id: str) -> dict[str, Any] | None:
    assignment_oid = coerce_object_id(assignment_id)
    if assignment_oid is None:
        return None
    return await db["homeworks"].find_one({"_id": assignment_oid})


async def is_legacy_course_enrolled(*, user_id: str, course_section_id: str) -> bool:
    section_oid = coerce_object_id(course_section_id)
    if section_oid is None:
        return False

    section = await db.course_sections.find_one({"_id": section_oid})
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
    submitted_at = utcnow()
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
    "list_legacy_homeworks_by_course",
    "load_legacy_homework",
    "load_legacy_homework_submission_map",
    "upsert_legacy_submission",
]
