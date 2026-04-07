"""Shared backend utility helpers."""

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


def safe_object_id(id_str: str, *, label: str = "ID") -> ObjectId:
    """Convert a string to ObjectId, raising HTTP 400 on invalid format."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}: {id_str!r}")
