"""Main /chat streaming endpoint."""
from __future__ import annotations

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse

from backend.core.security import get_current_user
from backend.schemas import AiChatSchema

from .chat_orchestration import hydrate_chat_request, parse_and_validate_chat_request, stream_chat_frames
from .router import _limiter, ai_router


@ai_router.post("/chat")
@_limiter.limit("30/minute")
async def ai_chat(
    request: Request,
    req: AiChatSchema,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    parsed = parse_and_validate_chat_request(req, user)
    parsed = await hydrate_chat_request(parsed, req, user)
    return StreamingResponse(stream_chat_frames(parsed, req, user), media_type="text/event-stream")
