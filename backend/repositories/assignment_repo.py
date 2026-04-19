"""Assignment repository — CRUD for the assignments collection."""
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.core.database import db
from ._helpers import serialize_doc


async def create_assignment(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.assignments.insert_one(data)
    doc = await db.assignments.find_one({"_id": result.inserted_id})
    return serialize_doc(doc)


async def get_assignment(assignment_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.assignments.find_one({"_id": ObjectId(assignment_id)})
    if doc:
        return serialize_doc(doc)
    return None


async def list_assignments(course_section_id: str) -> List[Dict[str, Any]]:
    docs = await db.assignments.find({"courseSectionId": course_section_id}).to_list(length=5000)
    return [serialize_doc(d) for d in docs]


async def update_assignment(assignment_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.assignments.update_one({"_id": ObjectId(assignment_id)}, {"$set": data})
    return await get_assignment(assignment_id)


async def delete_assignment(assignment_id: str) -> bool:
    result = await db.assignments.delete_one({"_id": ObjectId(assignment_id)})
    return result.deleted_count > 0
