"""Document repository — CRUD for the documents collection."""
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.core.database import db
from ._helpers import serialize_doc


async def create_document(data: Dict[str, Any]) -> Dict[str, Any]:
    data.pop("_id", None)
    result = await db.documents.insert_one(data)
    doc = await db.documents.find_one({"_id": result.inserted_id})
    return serialize_doc(doc)


async def get_document(document_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.documents.find_one({"_id": ObjectId(document_id)})
    if doc:
        return serialize_doc(doc)
    return None


async def list_documents(owner_id: str, source_type: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"ownerId": owner_id}
    if source_type:
        q["sourceType"] = source_type
    docs = await db.documents.find(q).to_list(length=500)
    return [serialize_doc(d) for d in docs]
