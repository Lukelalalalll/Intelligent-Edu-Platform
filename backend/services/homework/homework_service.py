from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from backend.repositories import homework_repo
from backend.repositories._helpers import require_object_id, utcnow
from backend.schemas.homework import HomeworkResponse, HomeworkSubmissionResponse
from backend.services.grading_service import create_assignment

logger = logging.getLogger("homework_routes")


def _require_role(current_user: dict[str, Any], allowed_roles: set[str], detail: str) -> None:
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail=detail)


def _homework_response(doc: dict[str, Any]) -> HomeworkResponse:
    return HomeworkResponse(
        id=str(doc["_id"]),
        **{key: value for key, value in doc.items() if key != "_id"},
    )


def _submission_response(doc: dict[str, Any]) -> HomeworkSubmissionResponse:
    return HomeworkSubmissionResponse(
        id=str(doc["_id"]),
        **{key: value for key, value in doc.items() if key != "_id"},
    )


async def publish_homework(*, homework, current_user: dict[str, Any]) -> HomeworkResponse:
    _require_role(current_user, {"teacher", "admin"}, "Only teachers can publish homework")

    teacher_id = str(current_user["_id"])
    document = {
        "course_id": homework.course_id,
        "teacher_id": teacher_id,
        "title": homework.title,
        "description": homework.description,
        "required_file_types": homework.required_file_types,
        "deadline": homework.deadline,
        "created_at": utcnow(),
    }

    result = await homework_repo.insert_homework(document)
    document["_id"] = result.inserted_id

    try:
        await create_assignment(
            {
                "courseSectionId": homework.course_id,
                "title": homework.title,
                "description": homework.description,
                "dueDate": homework.deadline.isoformat() if homework.deadline else "",
                "requiredFileTypes": homework.required_file_types,
                "createdBy": teacher_id,
                "homeworkId": str(document["_id"]),
            }
        )
    except Exception as exc:
        logger.error("Failed to create v2 assignment for homework %s: %s", str(document["_id"]), exc)

    return _homework_response(document)


async def list_teacher_homeworks(*, course_id: str | None, current_user: dict[str, Any]) -> list[HomeworkResponse]:
    _require_role(current_user, {"teacher"}, "Access denied")

    query = {"teacher_id": str(current_user["_id"])}
    if course_id:
        query["course_id"] = course_id

    documents = await homework_repo.list_homeworks(query, sort=[("created_at", -1)])
    return [_homework_response(doc) for doc in documents]


async def list_student_assignments(*, course_id: str | None, current_user: dict[str, Any]) -> dict[str, Any]:
    _require_role(current_user, {"student"}, "Access denied")

    student_id = str(current_user["_id"])
    course_ids = await homework_repo.list_student_course_ids(student_id)
    if course_id:
        if course_id not in course_ids:
            return {"assignments": []}
        course_ids = [course_id]

    if not course_ids:
        return {"assignments": []}

    submissions = await homework_repo.list_submissions_by_student(student_id)
    submission_by_homework = {submission["homework_id"]: submission for submission in submissions}
    documents = await homework_repo.list_homeworks({"course_id": {"$in": course_ids}}, sort=[("deadline", 1)])

    results = []
    for doc in documents:
        homework_id = str(doc["_id"])
        submission = submission_by_homework.get(homework_id)
        results.append(
            {
                "id": homework_id,
                "title": doc.get("title", ""),
                "description": doc.get("description", ""),
                "dueAt": doc.get("deadline", ""),
                "required_file_types": doc.get("required_file_types", []),
                "hasSubmitted": submission is not None,
                "status": submission.get("status", "pending") if submission else "pending",
                "submission": {
                    "pdfPath": submission.get("file_name", ""),
                    "submittedAt": str(submission.get("submitted_at"))[:10] if submission else "",
                }
                if submission
                else None,
            }
        )
    return {"assignments": results}


def _is_allowed_file_extension(filename: str, allowed_types: list[str]) -> bool:
    suffix = Path(filename or "").suffix.lower()
    normalized_allowed = [item.lower() for item in allowed_types]
    if not normalized_allowed or "*" in normalized_allowed or ".*" in normalized_allowed or "all" in normalized_allowed:
        return True
    return any(required and required in suffix for required in normalized_allowed)


def _save_submission_file(*, homework_id: str, student_id: str, filename: str, content: bytes) -> str:
    upload_dir = Path("uploads") / "homeworks"
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{homework_id}_{student_id}_{filename}"
    file_path = upload_dir / safe_filename
    file_path.write_bytes(content)
    return str(file_path)


async def submit_homework(
    *,
    homework_id: str,
    filename: str,
    content: bytes,
    current_user: dict[str, Any],
) -> HomeworkSubmissionResponse:
    _require_role(current_user, {"student"}, "Access denied")
    try:
        require_object_id(homework_id, detail="Invalid homework ID")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    homework = await homework_repo.find_homework_by_id(homework_id)
    if not homework:
        raise HTTPException(status_code=404, detail="Homework not found")

    if not _is_allowed_file_extension(filename, homework.get("required_file_types", [])):
        allowed = [item.lower() for item in homework.get("required_file_types", [])]
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed)}")

    document = {
        "homework_id": homework_id,
        "student_id": str(current_user["_id"]),
        "file_path": _save_submission_file(
            homework_id=homework_id,
            student_id=str(current_user["_id"]),
            filename=filename,
            content=content,
        ),
        "file_name": filename,
        "status": "submitted",
        "submitted_at": utcnow(),
    }

    result = await homework_repo.insert_submission(document)
    document["_id"] = result.inserted_id
    return _submission_response(document)
