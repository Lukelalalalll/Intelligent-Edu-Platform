from __future__ import annotations

from fastapi import HTTPException

from backend.services.grading_service import list_all_enrollments

from .legacy_homework import is_legacy_course_enrolled


async def ensure_course_membership(*, user_id: str, course_section_id: str) -> None:
    if not course_section_id:
        return

    v2_enrollments = await list_all_enrollments(
        course_section_id=course_section_id,
        user_id=user_id,
    )
    if v2_enrollments:
        return

    if not await is_legacy_course_enrolled(user_id=user_id, course_section_id=course_section_id):
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")


__all__ = ["ensure_course_membership"]
