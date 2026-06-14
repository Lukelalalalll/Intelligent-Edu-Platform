from __future__ import annotations

from backend.repositories import user_repo
from backend.services.grading_service import get_grade, list_submissions


async def list_assignment_submissions_with_student_info(assignment_id: str) -> list[dict]:
    submissions = await list_submissions(assignment_id)

    student_ids = [submission.get("studentId", "") for submission in submissions if submission.get("studentId")]
    students = await user_repo.find_many_by_ids(
        student_ids,
        projection={"username": 1, "email": 1},
    )
    student_by_id = {str(student["_id"]): student for student in students}

    for submission in submissions:
        student = student_by_id.get(submission.get("studentId", ""))
        if student:
            submission["studentName"] = student.get("username", "")
            submission["studentEmail"] = student.get("email", "")

        grade = await get_grade(submission["id"])
        if grade:
            submission["totalScore"] = grade.get("totalScore")
            submission["gradingStatus"] = grade.get("gradingStatus")

    return submissions
