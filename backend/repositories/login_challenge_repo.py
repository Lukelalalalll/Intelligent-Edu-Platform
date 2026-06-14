from __future__ import annotations

from typing import Any

from backend.core.database import db


async def insert_challenge(document: dict[str, Any]):
    return await db.login_mfa_challenges.insert_one(document)


async def find_by_challenge_id(
    challenge_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.login_mfa_challenges.find_one({"challenge_id": challenge_id}, projection)


async def update_by_challenge_id(challenge_id: str, update: dict[str, Any]):
    return await db.login_mfa_challenges.update_one({"challenge_id": challenge_id}, update)
