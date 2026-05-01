"""Study Room cloud notes — CRUD backed by MongoDB (Phase B)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.database import db
from backend.core.security import get_current_user
from .router import study_notes_router


def _user_id(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "")


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    for k in ("created_at", "updated_at"):
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    return doc


class RoomNoteUpsert(BaseModel):
    note_id: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., max_length=20000)
    color: str = Field("yellow", max_length=32)
    highlighted_text: Optional[str] = Field(None, max_length=5000)
    source_doc: Optional[str] = Field(None, max_length=256)  # file.name + file.size hash
    page_number: Optional[int] = None


@study_notes_router.get("/room-notes")
async def list_room_notes(
    source_doc: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List all cloud study-room notes for the current user.

    Optionally filter by ``source_doc`` (document identifier).
    """
    uid = _user_id(user)
    query: dict = {"user_id": uid}
    if source_doc:
        query["source_doc"] = source_doc
    docs = await db.study_room_notes.find(query).sort("created_at", -1).to_list(200)
    return [_serialize(d) for d in docs]


@study_notes_router.post("/room-notes")
async def upsert_room_note(
    payload: RoomNoteUpsert,
    user: dict = Depends(get_current_user),
):
    """Create or update a study-room note (idempotent — keyed by note_id per user)."""
    uid = _user_id(user)
    now = datetime.now(timezone.utc)
    await db.study_room_notes.update_one(
        {"note_id": payload.note_id, "user_id": uid},
        {
            "$set": {
                **payload.model_dump(),
                "user_id": uid,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"ok": True}


@study_notes_router.delete("/room-notes/{note_id}")
async def delete_room_note(
    note_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a study-room note by its note_id."""
    uid = _user_id(user)
    result = await db.study_room_notes.delete_one({"note_id": note_id, "user_id": uid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Note not found")
    return {"ok": True}
