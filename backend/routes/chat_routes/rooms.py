"""Chat room CRUD, course groups, and group management."""

import logging

from fastapi import Depends

from backend.core.security import get_current_user
from backend.schemas import (
    ChatCreateCourseGroupSchema,
    ChatCreateDirectRoomSchema,
    ChatCreateRoomSchema,
)
from backend.services.chat_service.room_service import (
    add_room_member as add_group_member,
    create_course_group_room,
    create_group_room as create_group_chat_room,
    create_or_get_direct_room as create_direct_room,
    delete_room as delete_chat_room,
    get_room_info as load_room_info,
    kick_room_member as remove_group_member,
    leave_room as leave_group_room,
    list_courses_for_group as list_group_chat_courses,
    list_rooms_for_user,
)

from .router import chat_router, manager

logger = logging.getLogger(__name__)


@chat_router.get("/rooms")
async def get_rooms(user: dict = Depends(get_current_user)):
    """Get all chat rooms the current user is a member of."""
    return {"rooms": await list_rooms_for_user(str(user["id"]))}


@chat_router.post("/rooms")
async def create_group_room(body: ChatCreateRoomSchema, user: dict = Depends(get_current_user)):
    """Create a group chat room."""
    room_id = await create_group_chat_room(
        room_name=body.name,
        member_ids=body.memberIds,
        actor_id=str(user["id"]),
        actor_name=user.get("username", ""),
    )
    return {"ok": True, "roomId": room_id}


@chat_router.post("/rooms/direct")
async def create_or_get_direct_room(body: ChatCreateDirectRoomSchema, user: dict = Depends(get_current_user)):
    """Find or create a direct message room between two users (atomic upsert)."""
    room_id = await create_direct_room(actor_id=str(user["id"]), target_user_id=body.targetUserId)
    return {"ok": True, "roomId": room_id}


@chat_router.post("/rooms/from-course")
async def create_room_from_course(
    body: ChatCreateCourseGroupSchema,
    user: dict = Depends(get_current_user),
):
    """Create (or return existing) a group chat room for a course."""
    result = await create_course_group_room(course_id=body.courseId, user=user)
    if not result.get("isExisting") and result.get("room"):
        await manager.broadcast_to_room(
            result.get("memberIds", []),
            {"type": "room_created", "room": result["room"]},
            exclude=str(user["id"]),
        )
    return {"ok": True, "roomId": result["roomId"], "isExisting": result["isExisting"]}


@chat_router.get("/rooms/from-course/list")
async def list_courses_for_group(user: dict = Depends(get_current_user)):
    """List courses the current user can create group chats for."""
    return {"courses": await list_group_chat_courses(user)}


@chat_router.get("/rooms/{room_id}/info")
async def get_room_info(room_id: str, user: dict = Depends(get_current_user)):
    """Get detailed room info including member profiles."""
    result = await load_room_info(room_id=room_id, user_id=str(user["id"]))
    return {"ok": True, "room": result["room"], "members": result["members"], "isOwner": result["isOwner"]}


@chat_router.post("/rooms/{room_id}/members/add")
async def add_room_member(room_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Add a member to a group room. Only the owner can add members."""
    result = await add_group_member(
        room_id=room_id,
        new_member_id=body.get("userId", ""),
        actor_id=str(user["id"]),
        actor_name=user.get("username", ""),
    )
    room = result.get("room")
    if room:
        await manager.broadcast_to_room(room.get("members", []), {"type": "room_updated", "roomId": room_id})
    return {"ok": True}


@chat_router.post("/rooms/{room_id}/members/kick")
async def kick_room_member(room_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Remove a member from a group room. Only the owner can kick members."""
    result = await remove_group_member(
        room_id=room_id,
        target_id=body.get("userId", ""),
        actor_id=str(user["id"]),
        actor_name=user.get("username", ""),
    )
    await manager.broadcast_to_room(result.get("roomMembers", []), {"type": "room_updated", "roomId": room_id})
    await manager.send_to_user(result["targetId"], {"type": "kicked_from_room", "roomId": room_id})
    return {"ok": True}


@chat_router.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, user: dict = Depends(get_current_user)):
    """Leave a group room. Owner cannot leave (must transfer or delete)."""
    result = await leave_group_room(
        room_id=room_id,
        actor_id=str(user["id"]),
        actor_name=user.get("username", ""),
    )
    room = result.get("room")
    if room:
        await manager.broadcast_to_room(room.get("members", []), {"type": "room_updated", "roomId": room_id})
    return {"ok": True}


@chat_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat room (hide for current user; owner can delete group entirely)."""
    result = await delete_chat_room(room_id=room_id, actor_id=str(user["id"]))
    if result.get("broadcastMembers"):
        await manager.broadcast_to_room(
            result["broadcastMembers"],
            {"type": "room_deleted", "roomId": room_id},
            exclude=str(user["id"]),
        )
    return {"ok": True}
