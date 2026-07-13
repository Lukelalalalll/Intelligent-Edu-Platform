"""Shared router instance, helpers, and WebSocket connection manager for chat."""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict

from bson import ObjectId
from fastapi import APIRouter, HTTPException, WebSocket

from backend.config import Config
from backend.core.utils import safe_object_id

# Allowed file types for chat uploads
ALLOWED_EXTENSIONS = {
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls',
    'md', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'webp'
}
# Magic bytes for content-based validation
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    'pdf': [b'%PDF'],
    'png': [b'\x89PNG'],
    'jpg': [b'\xff\xd8\xff'],
    'jpeg': [b'\xff\xd8\xff'],
    'gif': [b'GIF87a', b'GIF89a'],
    'zip': [b'PK\x03\x04', b'PK\x05\x06'],
    'docx': [b'PK\x03\x04'],  # OOXML uses ZIP container
    'pptx': [b'PK\x03\x04'],
    'xlsx': [b'PK\x03\x04'],
    'doc': [b'\xd0\xcf\x11\xe0'],  # OLE2
    'ppt': [b'\xd0\xcf\x11\xe0'],
    'xls': [b'\xd0\xcf\x11\xe0'],
    'webp': [b'RIFF'],
}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB
CHAT_FILES_DIR = os.path.join(Config.BASE_DIR, 'static', 'chat_files')
os.makedirs(CHAT_FILES_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/chat", tags=["Chat"])


# ── Helpers ──

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _str_id(doc: dict) -> dict:
    """Convert MongoDB _id to string id field."""
    if doc and "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


def _storage_path_from_file_url(file_url: str) -> str:
    return str(file_url or "").strip().lstrip("/")


def _hash_color(name: str) -> str:
    """Generate a stable HSL color from a string."""
    h = hash(name) % 360
    return f"hsl({h}, 60%, 45%)"


# ── WebSocket Connection Manager ──

class ConnectionManager:
    """Manage active WebSocket connections per user."""

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        if user_id in self._connections:
            try:
                await self._connections[user_id].close()
            except Exception as exc:
                logger.warning("Failed to close old WS connection | user=%s err=%s", user_id, str(exc)[:200])
        self._connections[user_id] = ws

    def disconnect(self, user_id: str):
        self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict):
        ws = self._connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_room(self, room_members: list, data: dict, exclude: str | None = None):
        for member_id in room_members:
            if member_id != exclude:
                await self.send_to_user(member_id, data)


manager = ConnectionManager()


async def _ws_send_to_user(user_id: str, data: dict):
    """Helper to send WS event from REST endpoints."""
    await manager.send_to_user(user_id, data)
