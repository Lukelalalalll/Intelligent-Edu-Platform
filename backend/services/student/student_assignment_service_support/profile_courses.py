from __future__ import annotations

from typing import Any

from backend.services.auth.security_audit import log_security_event
from backend.services.auth.user_profile_service import load_profile_courses
from backend.services.grading_service import (
    get_course_section,
    list_all_assignments,
    list_all_enrollments,
)

from .common import find_course_section_by_code, user_id_from_user
from .legacy_homework import count_extra_legacy_homeworks


async def load_profile_courses_v2(current_user: dict[str, Any], *, semester_label: str) -> dict[str, Any]:
    user_id = user_id_from_user(current_user)
    role = current_user.get("role", "student")
    enrollments = await list_all_enrollments(user_id=user_id)

    if not enrollments:
        legacy_result = await load_profile_courses(current_user)
        for course in legacy_result.get("courses", []):
            code = course.get("courseId") or course.get("id")
            section = await find_course_section_by_code(str(code or ""))
            if not section:
                continue

            course_section_id = str(section["_id"])
            course["courseSectionId"] = course_section_id
            assignments = await list_all_assignments(course_section_id)
            total = len(assignments) + await count_extra_legacy_homeworks(course_section_id, assignments)
            if total > course.get("assignmentCount", 0):
                course["assignmentCount"] = total
        return legacy_result

    courses: list[dict[str, Any]] = []
    section_ids = list(
        dict.fromkeys(
            str(item["courseSectionId"])
            for item in enrollments
            if item.get("courseSectionId")
        )
    )

    for section_id in section_ids:
        try:
            course = await get_course_section(section_id)
            if not course:
                continue

            assignments = await list_all_assignments(section_id)
            course["assignmentCount"] = len(assignments) + await count_extra_legacy_homeworks(section_id, assignments)

            section_enrollments = await list_all_enrollments(course_section_id=section_id)
            course["studentCount"] = sum(
                1
                for enrollment in section_enrollments
                if enrollment.get("roleInCourse") == "student"
            )

            user_enrollment = next(
                (
                    enrollment
                    for enrollment in enrollments
                    if enrollment.get("courseSectionId") == section_id
                ),
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


__all__ = ["load_profile_courses_v2"]
