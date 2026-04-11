"""Contacts (Friend System) endpoints."""

from bson import ObjectId
from fastapi import Depends, HTTPException, Query

from backend.core.database import db
from backend.core.security import get_current_user
from backend.core.utils import safe_object_id
from backend.schemas import ChatFriendRequestSchema
from backend.services.chat_search_service import sanitize_user_search_query

from .router import chat_router, _utcnow, _ws_send_to_user


@chat_router.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    """Get accepted contacts for current user."""
    uid = str(user["id"])
    cursor = db.chat_contacts.find({
        "$or": [
            {"userId": uid, "status": "accepted"},
            {"contactId": uid, "status": "accepted"},
        ]
    })
    other_ids: list[str] = []
    async for doc in cursor:
        other_id = doc["contactId"] if doc["userId"] == uid else doc["userId"]
        other_ids.append(other_id)

    if not other_ids:
        return {"contacts": []}

    oid_list = [ObjectId(oid) for oid in other_ids]
    user_map: dict[str, dict] = {}
    async for u in db.users.find({"_id": {"$in": oid_list}}, {"_id": 1, "username": 1, "email": 1, "role": 1}):
        user_map[str(u["_id"])] = u

    contacts = []
    for oid in other_ids:
        u = user_map.get(oid)
        if u:
            contacts.append({
                "id": oid,
                "username": u.get("username", ""),
                "email": u.get("email", ""),
                "role": u.get("role", "student"),
            })
    return {"contacts": contacts}


@chat_router.post("/contacts/request")
async def send_friend_request(body: ChatFriendRequestSchema, user: dict = Depends(get_current_user)):
    """Send a friend request to another user by username."""
    uid = str(user["id"])
    target = await db.users.find_one({"username": body.targetUsername})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target_id = str(target["_id"])
    if target_id == uid:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    existing = await db.chat_contacts.find_one({
        "$or": [
            {"userId": uid, "contactId": target_id},
            {"userId": target_id, "contactId": uid},
        ]
    })
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        if existing["status"] == "pending":
            raise HTTPException(status_code=400, detail="Friend request already pending")

    now = _utcnow()
    await db.chat_contacts.insert_one({
        "userId": uid,
        "contactId": target_id,
        "status": "pending",
        "createdAt": now,
        "updatedAt": now,
    })

    await _ws_send_to_user(target_id, {
        "type": "friend_request",
        "from": {"id": uid, "username": user.get("username", "")},
        "sentAt": now,
    })

    return {"ok": True, "message": "Friend request sent"}


@chat_router.get("/contacts/requests")
async def get_friend_requests(user: dict = Depends(get_current_user)):
    """Get pending friend requests received by current user."""
    uid = str(user["id"])
    cursor = db.chat_contacts.find({"contactId": uid, "status": "pending"})
    docs = []
    sender_ids: list[str] = []
    async for doc in cursor:
        docs.append(doc)
        sender_ids.append(doc["userId"])

    if not docs:
        return {"requests": []}

    oid_list = [ObjectId(sid) for sid in sender_ids]
    sender_map: dict[str, dict] = {}
    async for u in db.users.find({"_id": {"$in": oid_list}}, {"_id": 1, "username": 1, "email": 1, "role": 1}):
        sender_map[str(u["_id"])] = u

    requests = []
    for doc in docs:
        sender = sender_map.get(doc["userId"])
        if sender:
            requests.append({
                "id": str(doc["_id"]),
                "fromId": doc["userId"],
                "fromUsername": sender.get("username", ""),
                "fromEmail": sender.get("email", ""),
                "fromRole": sender.get("role", "student"),
                "sentAt": doc.get("createdAt", ""),
            })
    return {"requests": requests}


@chat_router.post("/contacts/{contact_id}/accept")
async def accept_friend_request(contact_id: str, user: dict = Depends(get_current_user)):
    """Accept a pending friend request."""
    uid = str(user["id"])
    result = await db.chat_contacts.update_one(
        {"_id": safe_object_id(contact_id, label="contact"), "contactId": uid, "status": "pending"},
        {"$set": {"status": "accepted", "updatedAt": _utcnow()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or already accepted")

    doc = await db.chat_contacts.find_one({"_id": safe_object_id(contact_id, label="contact")})
    if doc:
        await _ws_send_to_user(doc["userId"], {
            "type": "friend_accepted",
            "by": {"id": uid, "username": user.get("username", "")},
        })

    return {"ok": True}


@chat_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    """Delete or reject a contact / friend request."""
    uid = str(user["id"])
    result = await db.chat_contacts.delete_one({
        "_id": safe_object_id(contact_id, label="contact"),
        "$or": [{"userId": uid}, {"contactId": uid}],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


@chat_router.get("/users/search")
async def search_users(q: str = Query(..., min_length=1, max_length=50), user: dict = Depends(get_current_user)):
    """Search platform users by username (for adding friends)."""
    uid = str(user["id"])
    try:
        safe_pattern = sanitize_user_search_query(q)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cursor = db.users.find(
        {"username": {"$regex": safe_pattern, "$options": "i"}},
        {"_id": 1, "username": 1, "email": 1, "role": 1},
    ).limit(20)
    users = []
    async for u in cursor:
        u_id = str(u["_id"])
        if u_id == uid:
            continue
        users.append({
            "id": u_id,
            "username": u.get("username", ""),
            "email": u.get("email", ""),
            "role": u.get("role", "student"),
        })
    return {"users": users}
