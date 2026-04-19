"""Enrollment repository — CRUD for the enrollments collection."""
from typing import Any, Dict, List, Optional

from backend.core.database import db
from ._helpers import serialize_doc


async def enroll_user(course_section_id: str, user_id: str, role: str = "student") -> Dict[str, Any]:
    doc = {
        "courseSectionId": course_section_id,
        "userId": user_id,
        "roleInCourse": role,
    }
    await db.enrollments.update_one(
        {"courseSectionId": course_section_id, "userId": user_id},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def unenroll_user(course_section_id: str, user_id: str) -> bool:
    result = await db.enrollments.delete_one({"courseSectionId": course_section_id, "userId": user_id})
    return result.deleted_count > 0


async def list_enrollments(
    course_section_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if course_section_id:
        q["courseSectionId"] = course_section_id
    if user_id:
        q["userId"] = user_id
    docs = await db.enrollments.find(q).to_list(length=5000)
    return [serialize_doc(d) for d in docs]
