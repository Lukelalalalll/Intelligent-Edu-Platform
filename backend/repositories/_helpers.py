"""Shared repository helpers: serialization, ObjectId, timestamps."""
from datetime import datetime, timezone
from typing import Any, Dict


def oid(doc: Dict[str, Any]) -> str:
    """Stringify the Mongo _id field."""
    return str(doc.get("_id", ""))


def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Replace ObjectId _id with a plain string 'id' so FastAPI can JSON-encode it."""
    doc["id"] = oid(doc)
    doc.pop("_id", None)
    return doc


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
