"""Shared backend utility helpers."""

from bson import ObjectId
from fastapi import HTTPException

from backend.repositories._helpers import require_object_id


def safe_object_id(id_str: str, *, label: str = "ID") -> ObjectId:
    """Convert a string to ObjectId, raising HTTP 400 on invalid format."""
    try:
        return require_object_id(id_str, detail=f"Invalid {label}: {id_str!r}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
