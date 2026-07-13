"""Shared repository helpers for MongoDB-backed repositories."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


def oid(doc: dict[str, Any]) -> str:
    """Stringify the Mongo ``_id`` field."""
    return str(doc.get("_id", ""))


def coerce_object_id(value: str | ObjectId | None) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError, ValueError):
        return None


def require_object_id(value: str | ObjectId, *, detail: str = "Invalid object id") -> ObjectId:
    resolved = coerce_object_id(value)
    if resolved is None:
        raise ValueError(detail)
    return resolved


def serialize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Replace ``_id`` with a plain string ``id`` for JSON responses."""
    doc["id"] = oid(doc)
    doc.pop("_id", None)
    return doc


def serialize_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [serialize_doc(doc) for doc in docs]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_pagination(
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> tuple[int, int]:
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(MAX_PAGE_SIZE, int(page_size or DEFAULT_PAGE_SIZE)))
    return safe_page, safe_page_size


def build_page_result(
    *,
    items: list[dict[str, Any]],
    total: int,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    return {
        "items": items,
        "total": int(total),
        "page": int(page),
        "page_size": int(page_size),
    }
