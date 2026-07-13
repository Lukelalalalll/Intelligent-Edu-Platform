from __future__ import annotations

from typing import Any

from backend.core.database import db


async def insert_ticket(document: dict[str, Any]):
    return await db.google_auth_tickets.insert_one(document)


async def find_by_ticket_id(
    ticket_id: str,
    projection: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return await db.google_auth_tickets.find_one({"ticket_id": ticket_id}, projection)


async def update_by_ticket_id(ticket_id: str, update: dict[str, Any]):
    return await db.google_auth_tickets.update_one({"ticket_id": ticket_id}, update)
