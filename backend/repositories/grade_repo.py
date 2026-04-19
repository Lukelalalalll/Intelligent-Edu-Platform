"""Grade repository — CRUD for the grades collection."""
from typing import Any, Dict, Optional

from bson import ObjectId

from backend.core.database import db
from ._helpers import serialize_doc, utcnow


async def upsert_grade(submission_id: str, grader_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    data["submissionId"] = submission_id
    data["graderId"] = grader_id
    data.setdefault("gradedAt", utcnow())
    data.setdefault("gradingStatus", "draft")

    await db.grades.update_one(
        {"submissionId": submission_id},
        {"$set": data},
        upsert=True,
    )
    doc = await db.grades.find_one({"submissionId": submission_id})
    serialize_doc(doc)

    # Sync submission status
    status = "graded" if data.get("gradingStatus") == "final" else "grading"
    await db.submissions.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {"status": status, "latestGradeId": doc["id"]}},
    )
    return doc


async def get_grade(submission_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.grades.find_one({"submissionId": submission_id})
    if doc:
        return serialize_doc(doc)
    return None
