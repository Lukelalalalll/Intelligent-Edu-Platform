"""Enrollment and course-profile queries.

Provides ``get_user_course_profile`` — the core logic formerly embedded inside
``routes/auth_routes/profile.py``, moved here so that route modules in other
packages (e.g. ai_routes) can import it without creating cross-route
dependencies.
"""
from __future__ import annotations

from datetime import datetime

from backend.core.security import teacher_owns_course, student_enrolled_in_course
from backend.services.grading_service import load_courses


def _current_semester_label() -> str:
    now = datetime.now()
    if now.month <= 5:
        term = "Spring"
    elif now.month <= 8:
        term = "Summer"
    else:
        term = "Fall"
    return f"{now.year}-{term}"


def _course_summary(course: dict) -> dict:
    assignments = course.get("assignments", [])
    return {
        "id": course.get("id") or course.get("courseId"),
        "courseId": course.get("courseId") or course.get("id"),
        "name": course.get("name", ""),
        "semester": course.get("semester", ""),
        "degreeLevel": course.get("degreeLevel", ""),
        "teacherId": course.get("teacherId", ""),
        "assignmentCount": len(assignments),
        "studentCount": len(course.get("studentList", [])),
        "courseSectionId": course.get("courseSectionId"),
    }


async def get_user_course_profile(user: dict) -> dict:
    """Return {role, semester, courses} for the given user document.

    Callers must already have the full user dict (e.g. from
    ``get_current_user``).  This is a plain async function — no FastAPI
    dependency injection.
    """
    all_courses = (await load_courses()).get("courses", [])
    role = user.get("role", "student")

    if role == "admin":
        return {
            "role": role,
            "semester": _current_semester_label(),
            "courses": [_course_summary(c) for c in all_courses],
        }

    if role == "teacher":
        semester = _current_semester_label()
        teaching_courses = [c for c in all_courses if teacher_owns_course(user, c)]
        current_semester_courses = [c for c in teaching_courses if str(c.get("semester") or "") == semester]
        selected = current_semester_courses if current_semester_courses else teaching_courses
        return {
            "role": role,
            "semester": semester,
            "courses": [_course_summary(c) for c in selected],
        }

    if role == "student":
        enrolled = [c for c in all_courses if student_enrolled_in_course(user, c)]
        return {
            "role": role,
            "semester": _current_semester_label(),
            "courses": [_course_summary(c) for c in enrolled],
        }

    return {
        "role": role,
        "semester": _current_semester_label(),
        "courses": [],
    }
