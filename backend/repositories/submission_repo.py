"""Submission repository — CRUD for the submissions collection."""
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.core.database import db
from ._helpers import serialize_doc, utcnow


async def create_submission(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    data.setdefault("status", "pending")
    data.setdefault("submittedAt", utcnow())
    data.setdefault("attemptNo", 1)
    result = await db.submissions.insert_one(data)
    doc = await db.submissions.find_one({"_id": result.inserted_id})
    return serialize_doc(doc)


async def get_submission(submission_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.submissions.find_one({"_id": ObjectId(submission_id)})
    if doc:
        return serialize_doc(doc)
    return None


async def list_submissions(assignment_id: str) -> List[Dict[str, Any]]:
    docs = await db.submissions.find({"assignmentId": assignment_id}).to_list(length=5000)
    return [serialize_doc(d) for d in docs]


async def list_submissions_for_student(student_id: str) -> List[Dict[str, Any]]:
    docs = await db.submissions.find({"studentId": student_id}).to_list(length=5000)
    return [serialize_doc(d) for d in docs]


async def update_submission(submission_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data.pop("_id", None)
    await db.submissions.update_one({"_id": ObjectId(submission_id)}, {"$set": data})
    return await get_submission(submission_id)
