"""Shared router, limiter, and helper functions for auth_routes."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.core.security import teacher_owns_course, student_enrolled_in_course

limiter = Limiter(key_func=get_remote_address)
auth_router = APIRouter(prefix="", tags=["Auth"])


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
        # v2 section ObjectId (filled in asynchronously where needed)
        "courseSectionId": course.get("courseSectionId"),
    }


def _teacher_owns_course(user: dict, course: dict) -> bool:
    return teacher_owns_course(user, course)


def _student_enrolled_in_course(user: dict, course: dict) -> bool:
    return student_enrolled_in_course(user, course)
