"""V2 student-facing endpoints: courses, assignments, submit, my-submissions."""
from __future__ import annotations

from fastapi import Depends, File, Form, UploadFile

from backend.core.security import get_current_user
from backend.services.student.student_assignment_service import (
    list_my_submissions as list_my_student_submissions,
    list_student_assignments as list_course_student_assignments,
    load_profile_courses_v2,
    submit_student_assignment,
)

from .router import _current_semester_label
from fastapi import APIRouter
router = APIRouter()


@router.get("/v2/profile/courses")
async def get_profile_courses_v2(current_user: dict = Depends(get_current_user)):
    """Return courses for the current user using the v2 enrollment model."""
    return await load_profile_courses_v2(current_user, semester_label=_current_semester_label())


@router.get("/v2/student/assignments/{course_section_id}")
async def get_student_assignments(course_section_id: str, current_user: dict = Depends(get_current_user)):
    """Return assignments for a course with the student's submission status."""
    return await list_course_student_assignments(course_section_id, current_user)


@router.post("/v2/student/submit")
async def student_submit(
    assignment_id: str = Form(..., alias="assignmentId"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Student uploads a PDF submission."""
    content = await file.read()
    return await submit_student_assignment(
        assignment_id=assignment_id,
        filename=file.filename or "",
        content=content,
        mime_type=file.content_type or "application/pdf",
        current_user=current_user,
    )


@router.get("/v2/student/my-submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Return all v2 submissions for the current student, with grade and feedback enriched."""
    return await list_my_student_submissions(current_user)

