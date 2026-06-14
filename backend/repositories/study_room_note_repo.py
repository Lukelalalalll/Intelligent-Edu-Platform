from __future__ import annotations

from typing import Any

from backend.core.database import db


async def list_notes(
    *,
    user_id: str,
    source_doc: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"user_id": user_id}
    if source_doc:
        query["source_doc"] = source_doc
    return await db.study_room_notes.find(query).sort("created_at", -1).to_list(length=limit)


async def upsert_note(*, note_id: str, user_id: str, payload: dict[str, Any], now):
    return await db.study_room_notes.update_one(
        {"note_id": note_id, "user_id": user_id},
        {
            "$set": {
                **payload,
                "user_id": user_id,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def delete_note(*, note_id: str, user_id: str):
    return await db.study_room_notes.delete_one({"note_id": note_id, "user_id": user_id})
