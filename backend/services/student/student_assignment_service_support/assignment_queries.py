from __future__ import annotations

from typing import Any

from backend.services.grading_service import (
    get_assignment,
    get_grade,
    list_all_assignments,
    list_all_submissions_for_student,
)

from .common import resolve_course_section_id, user_id_from_user
from .legacy_homework import (
    list_legacy_homeworks_by_course,
    load_legacy_homework_submission_map,
)


async def list_student_assignments(course_section_id: str, current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = user_id_from_user(current_user)
    resolved_section_id = await resolve_course_section_id(course_section_id)

    assignments = await list_all_assignments(resolved_section_id)
    student_submissions = await list_all_submissions_for_student(user_id)
    submission_by_assignment = {
        submission.get("assignmentId", ""): submission
        for submission in student_submissions
    }

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

    legacy_submissions = await load_legacy_homework_submission_map(user_id)
    for homework in await list_legacy_homeworks_by_course(resolved_section_id):
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


async def list_my_submissions(current_user: dict[str, Any]) -> dict[str, Any]:
    user_id = user_id_from_user(current_user)
    submissions = await list_all_submissions_for_student(user_id)

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


__all__ = ["list_my_submissions", "list_student_assignments"]
