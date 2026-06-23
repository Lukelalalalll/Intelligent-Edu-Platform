"""Session CRUD endpoints, all scoped to current user."""

from fastapi import Depends, Request

from backend.core.security import get_current_user
from backend.schemas import UpdateAiSessionSchema
from backend.services.ai.ai_session_service import (
    create_session_for_user,
    delete_session_for_user,
    get_session_for_user,
    get_session_preview_for_user,
    list_sessions_for_user,
    update_session_for_user,
)

from .prompting import _STUDENT_SYSTEM_MSG, _TEACHER_SYSTEM_MSG
from fastapi import APIRouter
router = APIRouter()


@router.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    """Return all sessions for the current user (title + meta only, no messages)."""
    return {"sessions": await list_sessions_for_user(str(user["id"]))}


@router.post("/sessions")
async def create_session(user: dict = Depends(get_current_user)):
    """Create a new empty session and return its server-side id."""
    role = user.get("role", "student")
    system_content = _TEACHER_SYSTEM_MSG if role in ("teacher", "admin") else _STUDENT_SYSTEM_MSG
    return await create_session_for_user(user_id=str(user["id"]), system_content=system_content)


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    body: UpdateAiSessionSchema,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Sync a session's title and messages."""
    request_id = getattr(request.state, "request_id", "unknown")
    idempotency_key = (request.headers.get("X-Idempotency-Key") or "").strip()[:128]
    return await update_session_for_user(
        session_id=session_id,
        payload=body,
        user=user,
        request_id=request_id,
        idempotency_key=idempotency_key,
    )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a session owned by the current user."""
    await delete_session_for_user(session_id=session_id, user_id=str(user["id"]))
    return {"ok": True}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, limit: int | None = None, user: dict = Depends(get_current_user)):
    """Return a single session with a tail window of messages by default."""
    return await get_session_for_user(session_id=session_id, user_id=str(user["id"]), limit=limit)


@router.get("/sessions/{session_id}/preview")
async def get_session_preview(session_id: str, limit: int = 12, user: dict = Depends(get_current_user)):
    return await get_session_preview_for_user(session_id=session_id, user_id=str(user["id"]), limit=limit)

