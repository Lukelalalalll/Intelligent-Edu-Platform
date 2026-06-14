from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.core.database import db
from backend.core.utils import safe_object_id

from .chat_search_service import sanitize_user_search_query
from .query_service import get_user_map, utcnow_iso


def _serialize_contact_user(user: dict[str, Any], *, user_id: str) -> dict[str, Any]:
    return {
        "id": user_id,
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "student"),
    }


async def list_contacts_for_user(user_id: str) -> list[dict[str, Any]]:
    cursor = db.chat_contacts.find(
        {
            "$or": [
                {"userId": user_id, "status": "accepted"},
                {"contactId": user_id, "status": "accepted"},
            ]
        }
    )
    other_ids: list[str] = []
    async for doc in cursor:
        other_id = doc["contactId"] if doc["userId"] == user_id else doc["userId"]
        other_ids.append(other_id)

    if not other_ids:
        return []

    user_map = await get_user_map(other_ids)
    return [
        _serialize_contact_user(contact_user, user_id=other_id)
        for other_id in other_ids
        if (contact_user := user_map.get(other_id))
    ]


async def create_friend_request(*, user_id: str, username: str, target_username: str) -> dict[str, Any]:
    target = await db.users.find_one({"username": target_username}, {"_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target_id = str(target["_id"])
    if target_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    existing = await db.chat_contacts.find_one(
        {
            "$or": [
                {"userId": user_id, "contactId": target_id},
                {"userId": target_id, "contactId": user_id},
            ]
        },
        {"status": 1},
    )
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        if existing["status"] == "pending":
            raise HTTPException(status_code=400, detail="Friend request already pending")

    now = utcnow_iso()
    await db.chat_contacts.insert_one(
        {
            "userId": user_id,
            "contactId": target_id,
            "status": "pending",
            "createdAt": now,
            "updatedAt": now,
        }
    )
    return {
        "targetId": target_id,
        "sentAt": now,
        "sender": {"id": user_id, "username": username},
    }


async def list_pending_friend_requests(user_id: str) -> list[dict[str, Any]]:
    cursor = db.chat_contacts.find({"contactId": user_id, "status": "pending"})
    docs: list[dict[str, Any]] = []
    sender_ids: list[str] = []
    async for doc in cursor:
        docs.append(doc)
        sender_ids.append(doc["userId"])

    if not docs:
        return []

    sender_map = await get_user_map(sender_ids)
    requests: list[dict[str, Any]] = []
    for doc in docs:
        sender = sender_map.get(doc["userId"])
        if not sender:
            continue
        requests.append(
            {
                "id": str(doc["_id"]),
                "fromId": doc["userId"],
                "fromUsername": sender.get("username", ""),
                "fromEmail": sender.get("email", ""),
                "fromRole": sender.get("role", "student"),
                "sentAt": doc.get("createdAt", ""),
            }
        )
    return requests


async def accept_friend_request(*, contact_id: str, user_id: str, username: str) -> dict[str, Any]:
    contact_oid = safe_object_id(contact_id, label="contact")
    result = await db.chat_contacts.update_one(
        {"_id": contact_oid, "contactId": user_id, "status": "pending"},
        {"$set": {"status": "accepted", "updatedAt": utcnow_iso()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or already accepted")

    doc = await db.chat_contacts.find_one({"_id": contact_oid}, {"userId": 1})
    return {
        "requesterId": str(doc.get("userId", "")) if doc else "",
        "acceptedBy": {"id": user_id, "username": username},
    }


async def delete_contact_for_user(*, contact_id: str, user_id: str) -> None:
    result = await db.chat_contacts.delete_one(
        {
            "_id": safe_object_id(contact_id, label="contact"),
            "$or": [{"userId": user_id}, {"contactId": user_id}],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")


async def search_users_for_contacts(*, query: str, user_id: str) -> list[dict[str, Any]]:
    try:
        safe_pattern = sanitize_user_search_query(query)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cursor = db.users.find(
        {"username": {"$regex": safe_pattern, "$options": "i"}},
        {"_id": 1, "username": 1, "email": 1, "role": 1},
    ).limit(20)

    users: list[dict[str, Any]] = []
    async for doc in cursor:
        found_user_id = str(doc["_id"])
        if found_user_id == user_id:
            continue
        users.append(_serialize_contact_user(doc, user_id=found_user_id))
    return users
