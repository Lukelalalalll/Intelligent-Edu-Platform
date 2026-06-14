"""Contacts (Friend System) endpoints."""

from fastapi import Depends, Query

from backend.core.security import get_current_user
from backend.schemas import ChatFriendRequestSchema
from backend.services.chat_service.contact_service import (
    accept_friend_request as accept_contact_request,
    create_friend_request,
    delete_contact_for_user,
    list_contacts_for_user,
    list_pending_friend_requests,
    search_users_for_contacts,
)

from .router import chat_router, _ws_send_to_user


@chat_router.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    """Get accepted contacts for current user."""
    return {"contacts": await list_contacts_for_user(str(user["id"]))}


@chat_router.post("/contacts/request")
async def send_friend_request(body: ChatFriendRequestSchema, user: dict = Depends(get_current_user)):
    """Send a friend request to another user by username."""
    request_data = await create_friend_request(
        user_id=str(user["id"]),
        username=user.get("username", ""),
        target_username=body.targetUsername,
    )

    await _ws_send_to_user(
        request_data["targetId"],
        {
            "type": "friend_request",
            "from": request_data["sender"],
            "sentAt": request_data["sentAt"],
        },
    )

    return {"ok": True, "message": "Friend request sent"}


@chat_router.get("/contacts/requests")
async def get_friend_requests(user: dict = Depends(get_current_user)):
    """Get pending friend requests received by current user."""
    return {"requests": await list_pending_friend_requests(str(user["id"]))}


@chat_router.post("/contacts/{contact_id}/accept")
async def accept_friend_request(contact_id: str, user: dict = Depends(get_current_user)):
    """Accept a pending friend request."""
    result = await accept_contact_request(
        contact_id=contact_id,
        user_id=str(user["id"]),
        username=user.get("username", ""),
    )
    if result["requesterId"]:
        await _ws_send_to_user(
            result["requesterId"],
            {
                "type": "friend_accepted",
                "by": result["acceptedBy"],
            },
        )

    return {"ok": True}


@chat_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    """Delete or reject a contact / friend request."""
    await delete_contact_for_user(contact_id=contact_id, user_id=str(user["id"]))
    return {"ok": True}


@chat_router.get("/users/search")
async def search_users(q: str = Query(..., min_length=1, max_length=50), user: dict = Depends(get_current_user)):
    """Search platform users by username (for adding friends)."""
    return {"users": await search_users_for_contacts(query=q, user_id=str(user["id"]))}
