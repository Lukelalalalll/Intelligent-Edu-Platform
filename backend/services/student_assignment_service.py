from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.services.file_asset_service import register_file_asset
from backend.services.grading_service import (
    create_document,
    create_submission,
    get_assignment,
    get_course_section,
    get_grade,
    list_assignments,
    list_enrollments,
    list_submissions_for_student,
)
from backend.services.security_audit import log_security_event
from backend.services.user_profile_service import load_profile_courses

MAX_SUBMISSION_FILE_SIZE = 50 * 1024 * 1024


def _user_id(current_user: dict[str, Any]) -> str:
    return str(current_user.get("_id") or current_user.get("id") or "")


async def _find_course_section_by_code(course_code: str) -> dict[str, Any] | None:
    return await db.course_sections.find_one({"courseCode": course_code})


async def _count_extra_legacy_homeworks(course_section_id: str, assignments: list[dict[str, Any]]) -> int:
    v2_homework_ids = {assignment.get("homeworkId") for assignment in assignments if assignment.get("homeworkId")}
    count = 0
    async for homework in db["homeworks"].find({"course_id": course_section_id}):
        if str(homework["_id"]) not in v2_homework_ids:
            count += 1
    return count


async def _resolve_course_section_id(course_section_id: str) -> str:
    if ObjectId.is_valid(course_section_id):
        return course_section_id

    section = await _find_course_section_by_code(course_section_id)
    return str(section["_id"]) if section else course_section_id


async def _load_legacy_homework_submission_map(student_id: str) -> dict[str, dict[str, Any]]:
    submissions: dict[str, dict[str, Any]] = {}
    async for submission in db["homework_submissions"].find({"student_id": student_id}):
        submissions[str(submission["homework_id"])] = submission
    return submissions


async def _load_legacy_homework(assignment_id: str) -> dict[str, Any] | None:
    if not ObjectId.is_valid(assignment_id):
        return None
    return await db["homeworks"].find_one({"_id": ObjectId(assignment_id)})


async def _is_legacy_course_enrolled(*, user_id: str, course_section_id: str) -> bool:
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


async def _ensure_course_membership(*, user_id: str, course_section_id: str) -> None:
    if not course_section_id:
        return

    v2_enrollments = await list_enrollments(course_section_id=course_section_id, user_id=user_id)
    if v2_enrollments:
        return

    if not await _is_legacy_course_enrolled(user_id=user_id, course_section_id=course_section_id):
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")


def _submission_upload_root() -> Path:
    return Path(__file__).resolve().parents[1] / "uploads" / "submissions"


def _save_submission_file(*, user_id: str, assignment_id: str, filename: str, content: bytes) -> tuple[Path, str, str]:
    upload_dir = _submission_upload_root()
    upload_dir.mkdir(parents=True, exist_ok=True)

    checksum = hashlib.sha256(content).hexdigest()
    file_hash = checksum[:16]
    safe_filename = f"{user_id}_{assignment_id}_{file_hash}_{filename}"
    file_path = upload_dir / safe_filename
    file_path.write_bytes(content)
    return file_path, f"uploads/submissions/{safe_filename}", checksum


async def _upsert_legacy_submission(
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


async def load_profile_courses_v2(current_user: dict[str, Any], *, semester_label: str) -> dict[str, Any]:
    user_id = _user_id(current_user)
    role = current_user.get("role", "student")
    enrollments = await list_enrollments(user_id=user_id)

    if not enrollments:
        legacy_result = await load_profile_courses(current_user)
        for course in legacy_result.get("courses", []):
            code = course.get("courseId") or course.get("id")
            section = await _find_course_section_by_code(str(code or ""))
            if not section:
                continue

            course_section_id = str(section["_id"])
            course["courseSectionId"] = course_section_id
            assignments = await list_assignments(course_section_id)
            total = len(assignments) + await _count_extra_legacy_homeworks(course_section_id, assignments)
            if total > course.get("assignmentCount", 0):
                course["assignmentCount"] = total
        return legacy_result

    courses: list[dict[str, Any]] = []
    section_ids = list(dict.fromkeys(str(item["courseSectionId"]) for item in enrollments if item.get("courseSectionId")))

    for section_id in section_ids:
        try:
            course = await get_course_section(section_id)
            if not course:
                continue

            assignments = await list_assignments(section_id)
            course["assignmentCount"] = len(assignments) + await _count_extra_legacy_homeworks(section_id, assignments)

            section_enrollments = await list_enrollments(course_section_id=section_id)
            course["studentCount"] = sum(
                1 for enrollment in section_enrollments if enrollment.get("roleInCourse") == "student"
            )

            user_enrollment = next(
                (enrollment for enrollment in enrollments if enrollment.get("courseSectionId") == section_id),
                None,
            )
            course["roleInCourse"] = (
                user_enrollment.get("roleInCourse", "student") if user_enrollment else "student"
            )
            courses.append(course)
        except Exception as exc:
            log_security_event(
                level="warning",
                request_id="n/a",
                user_id=user_id,
                endpoint="/api/v2/profile/courses",
                action="course_section_resolve_failed",
                detail=str(exc)[:240],
                extra={"course_section_id": section_id},
            )

    return {
        "role": role,
        "semester": semester_label,
        "courses": courses,
    }


async def list_student_assignments(course_section_id: str, current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = _user_id(current_user)
    resolved_section_id = await _resolve_course_section_id(course_section_id)

    assignments = await list_assignments(resolved_section_id)
    student_submissions = await list_submissions_for_student(user_id)
    submission_by_assignment = {submission.get("assignmentId", ""): submission for submission in student_submissions}

    result: list[dict[str, Any]] = []
    v2_homework_ids: set[str] = set()
    for assignment in assignments:
        assignment_id = assignment.get("id", "")
        submission = submission_by_assignment.get(assignment_id)
        submission_id = submission.get("id", "") if submission else ""
        grade = await get_grade(submission_id) if submission_id else None
        is_graded = grade is not None and grade.get("gradingStatus") in ("draft", "final")
        result.append(
            {
                **assignment,
                "submission": submission,
                "hasSubmitted": submission is not None,
                "status": "graded"
                if is_graded
                else (submission.get("status", "not_submitted") if submission else "not_submitted"),
                "totalScore": grade.get("totalScore") if grade else None,
                "grade": {
                    "totalScore": grade.get("totalScore"),
                    "rubricScores": grade.get("rubricScores", {}),
                    "overallFeedback": grade.get("overallFeedback", ""),
                    "gradingStatus": grade.get("gradingStatus", ""),
                }
                if grade
                else None,
            }
        )
        if assignment.get("homeworkId"):
            v2_homework_ids.add(assignment["homeworkId"])

    legacy_submissions = await _load_legacy_homework_submission_map(user_id)
    cursor = db["homeworks"].find({"course_id": resolved_section_id}).sort("deadline", 1)
    async for homework in cursor:
        homework_id = str(homework["_id"])
        if homework_id in v2_homework_ids:
            continue

        submission = legacy_submissions.get(homework_id)
        deadline = str(homework.get("deadline", ""))
        result.append(
            {
                "id": homework_id,
                "title": homework.get("title", ""),
                "description": homework.get("description", ""),
                "dueDate": deadline,
                "dueAt": deadline,
                "requiredFileTypes": homework.get("required_file_types", []),
                "required_file_types": homework.get("required_file_types", []),
                "hasSubmitted": submission is not None,
                "status": submission.get("status", "not_submitted") if submission else "not_submitted",
                "totalScore": None,
                "submission": {
                    "pdfPath": submission.get("file_name", ""),
                    "submittedAt": str(submission.get("submitted_at", ""))[:10],
                }
                if submission
                else None,
                "_legacyHomework": True,
            }
        )

    return {"assignments": result}


async def submit_student_assignment(
    *,
    assignment_id: str,
    filename: str,
    content: bytes,
    mime_type: str,
    current_user: dict[str, Any],
) -> dict[str, Any]:
    user_id = _user_id(current_user)
    username = current_user.get("username", "student")

    assignment = await get_assignment(assignment_id)
    legacy_homework = None if assignment else await _load_legacy_homework(assignment_id)
    if not assignment and not legacy_homework:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_section_id = (
        assignment.get("courseSectionId", "")
        if assignment
        else str((legacy_homework or {}).get("course_id", ""))
    )
    await _ensure_course_membership(user_id=user_id, course_section_id=course_section_id)

    if not filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if len(content) > MAX_SUBMISSION_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    file_path, storage_key, checksum = _save_submission_file(
        user_id=user_id,
        assignment_id=assignment_id,
        filename=filename,
        content=content,
    )

    if legacy_homework:
        legacy_submission = await _upsert_legacy_submission(
            assignment_id=assignment_id,
            user_id=user_id,
            file_path=file_path,
            filename=filename,
        )
        return {
            "message": "Submission uploaded successfully",
            "submission": legacy_submission,
            "document": None,
        }

    document = await create_document(
        {
            "ownerType": "submission",
            "ownerId": "",
            "storageKey": storage_key,
            "filename": filename,
            "mimeType": mime_type or "application/pdf",
            "pageCount": 0,
            "checksum": checksum,
            "sourceType": "original",
        }
    )

    submission = await create_submission(
        {
            "assignmentId": assignment_id,
            "studentId": user_id,
            "studentName": username,
            "status": "pending",
            "attemptNo": 1,
            "latestDocumentId": document["id"],
            "pdfPath": storage_key,
        }
    )

    await db.documents.update_one(
        {"_id": ObjectId(document["id"])},
        {"$set": {"ownerId": submission["id"]}},
    )

    try:
        await register_file_asset(
            file_type="submission_pdf",
            storage_path=storage_key,
            size=len(content),
            owner_type="submission_document",
            owner_id=str(document["id"]),
            created_by=user_id,
            filename=filename,
            mime_type=mime_type or "application/pdf",
            checksum=checksum,
            course_id=str(course_section_id or ""),
            scope="submission",
            user_id=user_id,
            metadata={"assignmentId": assignment_id, "submissionId": submission["id"]},
        )
    except Exception as exc:
        log_security_event(
            level="warning",
            request_id="n/a",
            user_id=user_id,
            endpoint="/api/v2/student/submit",
            action="file_asset_register_failed",
            detail=str(exc)[:240],
            extra={"assignment_id": assignment_id, "submission_id": submission.get("id", "")},
        )

    return {
        "message": "Submission uploaded successfully",
        "submission": submission,
        "document": document,
    }


async def list_my_submissions(current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = _user_id(current_user)
    submissions = await list_submissions_for_student(user_id)

    result: list[dict[str, Any]] = []
    for submission in submissions:
        submission_id = submission.get("id", "")
        assignment_id = submission.get("assignmentId", "")
        assignment = await get_assignment(assignment_id) if assignment_id else None
        grade = await get_grade(submission_id) if submission_id else None

        result.append(
            {
                "id": submission_id,
                "assignmentId": assignment_id,
                "assignmentTitle": (assignment or {}).get("title", ""),
                "status": submission.get("status", "pending"),
                "submittedAt": submission.get("createdAt", ""),
                "pdfPath": submission.get("pdfPath", ""),
                "grade": {
                    "totalScore": (grade or {}).get("totalScore"),
                    "rubricScores": (grade or {}).get("rubricScores", {}),
                    "overallFeedback": (grade or {}).get("overallFeedback", ""),
                    "gradingStatus": (grade or {}).get("gradingStatus", ""),
                }
                if grade
                else None,
            }
        )

    return {"submissions": result}
