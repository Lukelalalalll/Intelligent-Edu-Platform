from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from backend.repositories import study_room_note_repo


def _serialize_note(doc: dict) -> dict:
    payload = dict(doc)
    payload.pop("_id", None)
    for key in ("created_at", "updated_at"):
        if isinstance(payload.get(key), datetime):
            payload[key] = payload[key].isoformat()
    return payload


def _user_id(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "")


async def list_room_notes(*, source_doc: str | None, user: dict, skip: int = 0, limit: int = 200) -> list[dict]:
    docs = await study_room_note_repo.list_notes(
        user_id=_user_id(user),
        source_doc=source_doc,
        skip=skip,
        limit=limit,
    )
    return [_serialize_note(doc) for doc in docs]


async def upsert_room_note(*, payload: dict, user: dict) -> dict:
    await study_room_note_repo.upsert_note(
        note_id=str(payload["note_id"]),
        user_id=_user_id(user),
        payload=payload,
        now=datetime.now(timezone.utc),
    )
    return {"ok": True}


async def delete_room_note(*, note_id: str, user: dict) -> dict:
    result = await study_room_note_repo.delete_note(note_id=note_id, user_id=_user_id(user))
    if result.deleted_count == 0:
        raise HTTPException(404, "Note not found")
    return {"ok": True}
