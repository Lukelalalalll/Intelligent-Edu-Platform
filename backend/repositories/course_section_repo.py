"""Course section repository — CRUD for the course_sections collection."""
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.core.database import db
from ._helpers import serialize_doc


async def create_course_section(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.course_sections.insert_one(data)
    doc = await db.course_sections.find_one({"_id": result.inserted_id})
    return serialize_doc(doc)


async def get_course_section(section_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.course_sections.find_one({"_id": ObjectId(section_id)})
    if doc:
        return serialize_doc(doc)
    return None


async def list_course_sections(filter_query: Optional[Dict] = None) -> List[Dict[str, Any]]:
    docs = await db.course_sections.find(filter_query or {}).to_list(length=5000)
    return [serialize_doc(d) for d in docs]


async def update_course_section(section_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.course_sections.update_one({"_id": ObjectId(section_id)}, {"$set": data})
    return await get_course_section(section_id)


async def delete_course_section(section_id: str) -> bool:
    result = await db.course_sections.delete_one({"_id": ObjectId(section_id)})
    if result.deleted_count:
        await db.enrollments.delete_many({"courseSectionId": section_id})
        await db.assignments.delete_many({"courseSectionId": section_id})
    return result.deleted_count > 0
