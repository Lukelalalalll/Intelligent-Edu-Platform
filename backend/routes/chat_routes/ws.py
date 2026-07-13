"""WebSocket endpoint for real-time chat."""

import logging

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from jose import JWTError

from backend.config import Config
from backend.services.auth.auth_session_service import decode_access_token, get_active_session_for_access
from backend.services.chat_service.message_service import create_message, mark_room_read_for_member
from backend.services.chat_service.query_service import get_chat_user_by_id, get_room_for_member

from .router import manager
from fastapi import APIRouter
router = APIRouter()

logger = logging.getLogger(__name__)


async def _authenticate_ws(token: str) -> dict | None:
    """Validate JWT token and return user dict, or None."""
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if not user_id or not session_id:
            return None
        user = await get_chat_user_by_id(user_id)
        if not user:
            return None
        await get_active_session_for_access(
            session_id=str(session_id),
            user_id=str(user_id),
            token_version=int(payload.get("token_version") or 0),
        )
        return user
    except (JWTError, Exception):
        return None


@router.websocket("/ws")
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
                    result = await create_message(
                        room_id=room_id,
                        user=user,
                        content=content,
                        message_type="text",
                        reply_to_id=data.get("replyTo", ""),
                    )
                except HTTPException:
                    continue

                room = result["room"]
                message = result["message"]
                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "new_message", "message": message},
                    exclude=uid,
                )
                await manager.send_to_user(
                    uid,
                    {"type": "message_ack", "localId": local_id, "message": message},
                )

            elif event_type == "typing":
                room_id = data.get("roomId", "")
                if not room_id:
                    continue
                try:
                    room = await get_room_for_member(room_id, uid)
                except HTTPException:
                    continue
                await manager.broadcast_to_room(
                    room.get("members", []),
                    {"type": "typing", "roomId": room_id, "userId": uid, "username": user.get("username", "")},
                    exclude=uid,
                )

            elif event_type == "read_receipt":
                room_id = data.get("roomId", "")
                if not room_id:
                    continue
                try:
                    room = await mark_room_read_for_member(room_id=room_id, user_id=uid)
                except HTTPException:
                    continue
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

