from __future__ import annotations

from typing import Any

from backend.core.database import db


async def insert_session(document: dict[str, Any]):
    return await db.user_sessions.insert_one(document)


async def find_by_session_id(
    session_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.user_sessions.find_one({"session_id": session_id}, projection)


async def find_by_refresh_token_hash(
    refresh_token_hash: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.user_sessions.find_one({"refresh_token_hash": refresh_token_hash}, projection)


async def update_by_session_id(session_id: str, update: dict[str, Any]):
    return await db.user_sessions.update_one({"session_id": session_id}, update)


async def revoke_session(session_id: str, revoked_at, reason: str):
    return await db.user_sessions.update_one(
        {"session_id": session_id, "revoked_at": None},
        {"$set": {"revoked_at": revoked_at, "revoked_reason": reason, "updated_at": revoked_at}},
    )


async def revoke_family(family_id: str, revoked_at, reason: str):
    return await db.user_sessions.update_many(
        {"family_id": family_id, "revoked_at": None},
        {"$set": {"revoked_at": revoked_at, "revoked_reason": reason, "updated_at": revoked_at}},
    )


async def revoke_all_for_user(user_id: str, revoked_at, reason: str):
    return await db.user_sessions.update_many(
        {"user_id": user_id, "revoked_at": None},
        {"$set": {"revoked_at": revoked_at, "revoked_reason": reason, "updated_at": revoked_at}},
    )


async def list_active_for_user(
    user_id: str,
    projection: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    cursor = (
        db.user_sessions
        .find({"user_id": user_id, "revoked_at": None}, projection)
        .sort("last_seen_at", -1)
    )
    return await cursor.to_list(length=100)
