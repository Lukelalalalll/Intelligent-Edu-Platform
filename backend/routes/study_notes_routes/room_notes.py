"""Study Room cloud notes endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends
from pydantic import BaseModel, Field

from backend.core.security import get_current_user
from backend.services.study_room_note_service import (
    delete_room_note as delete_room_note_service,
    list_room_notes as list_room_notes_service,
    upsert_room_note as upsert_room_note_service,
)

from .router import study_notes_router


class RoomNoteUpsert(BaseModel):
    note_id: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., max_length=20000)
    color: str = Field("yellow", max_length=32)
    highlighted_text: Optional[str] = Field(None, max_length=5000)
    source_doc: Optional[str] = Field(None, max_length=256)
    page_number: Optional[int] = None


@study_notes_router.get("/room-notes")
async def list_room_notes(
    source_doc: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    return await list_room_notes_service(source_doc=source_doc, user=user)


@study_notes_router.post("/room-notes")
async def upsert_room_note(
    payload: RoomNoteUpsert,
    user: dict = Depends(get_current_user),
):
    return await upsert_room_note_service(payload=payload.model_dump(), user=user)


@study_notes_router.delete("/room-notes/{note_id}")
async def delete_room_note(
    note_id: str,
    user: dict = Depends(get_current_user),
):
    return await delete_room_note_service(note_id=note_id, user=user)
