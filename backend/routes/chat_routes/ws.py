"""WebSocket endpoint for real-time chat."""

import logging

from fastapi import WebSocket, WebSocketDisconnect
from jose import jwt, JWTError

from backend.config import Config
from backend.core.database import db
from backend.core.utils import safe_object_id
from fastapi import HTTPException

from .router import chat_router, _utcnow, manager

logger = logging.getLogger(__name__)


async def _authenticate_ws(token: str) -> dict | None:
    """Validate JWT token and return user dict, or None."""
    try:
        payload = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        from bson import ObjectId as _ObjectId
        user = await db.users.find_one({"_id": _ObjectId(user_id)})
        if not user:
            return None
        user["id"] = str(user["_id"])
        return user
    except (JWTError, Exception):
        return None


@chat_router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    token = ws.cookies.get(Config.JWT_ACCESS_COOKIE_NAME, "")
    user = await _authenticate_ws(token) if token else None
    if not user:
        await ws.close(code=4001, reason="Unauthorized")
        return

    uid = str(user["id"])
    await manager.connect(uid, ws)
    logger.info("WS connected: user=%s", uid)

    try:
        while True:
            data = await ws.receive_json()
            event_type = data.get("type")

            if event_type == "new_message":
                room_id = data.get("roomId", "")
                content = (data.get("content", "") or "").strip()
                local_id = data.get("localId", "")
                if not room_id or not content:
                    continue

                try:
                    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                except HTTPException:
                    continue
                if not room:
                    continue

                reply_to = None
                reply_to_id = data.get("replyTo", "")
                if reply_to_id:
                    try:
                        ref = await db.chat_messages.find_one({"_id": safe_object_id(reply_to_id, label="message")})
                    except HTTPException:
                        ref = None
                    if ref:
                        reply_to = {
                            "id": str(ref["_id"]),
                            "senderName": ref.get("senderName", ""),
                            "content": (ref.get("content", "") or "")[:120],
                        }

                now = _utcnow()
                msg_doc = {
                    "roomId": room_id,
                    "senderId": uid,
                    "senderName": user.get("username", ""),
                    "content": content,
                    "type": "text",
                    "messageType": "text",
                    "replyTo": reply_to,
                    "recalled": False,
                    "readBy": [uid],
                    "deletedFor": [],
                    "sentAt": now,
                }
                result = await db.chat_messages.insert_one(msg_doc)
                msg_doc["id"] = str(result.inserted_id)
                msg_doc.pop("_id", None)

                try:
                    await db.chat_rooms.update_one(
                        {"_id": safe_object_id(room_id, label="room")},
                    {"$set": {"lastMessage": {
                        "content": content,
                        "senderId": uid,
                        "sentAt": now,
                        "readBy": [uid],
                    }}},
                )
                except HTTPException as exc:
                    logger.warning("Skipping lastMessage update due to invalid room id | user=%s room=%s detail=%s", uid, room_id, exc.detail)

                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "new_message", "message": msg_doc},
                    exclude=uid,
                )

                await manager.send_to_user(uid, {
                    "type": "message_ack",
                    "localId": local_id,
                    "message": msg_doc,
                })

            elif event_type == "typing":
                room_id = data.get("roomId", "")
                if not room_id:
                    continue
                try:
                    room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                except HTTPException:
                    continue
                if not room:
                    continue
                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "typing", "roomId": room_id, "userId": uid, "username": user.get("username", "")},
                    exclude=uid,
                )

            elif event_type == "read_receipt":
                room_id = data.get("roomId", "")
                if room_id:
                    await db.chat_messages.update_many(
                        {"roomId": room_id, "readBy": {"$ne": uid}},
                        {"$addToSet": {"readBy": uid}},
                    )
                    try:
                        room = await db.chat_rooms.find_one({"_id": safe_object_id(room_id, label="room"), "members": uid})
                    except HTTPException:
                        room = None
                    if room:
                        await manager.broadcast_to_room(
                            room.get("members", []),
                            {"type": "read_receipt", "roomId": room_id, "userId": uid},
                            exclude=uid,
                        )

    except WebSocketDisconnect:
        logger.info("WS disconnected: user=%s", uid)
    except Exception:
        logger.exception("WS error: user=%s", uid)
    finally:
        manager.disconnect(uid)
