from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import suppress
from typing import AsyncIterator, Optional

from fastapi import Request

from backend.presenton_runtime_context import resolve_presenton_owner_user_id
from api.v1.ppt.endpoints.presentation_fonts import resolve_presentation_fonts
from models.presentation_structure_model import PresentationStructureModel
from models.sse_response import SSEStatusResponse
from utils.export_utils import resolve_web_origin
from utils.simple_auth import (
    SESSION_COOKIE_NAME,
    create_session_token,
    get_session_token_from_request,
)

logger = logging.getLogger(__name__)
STREAM_HEARTBEAT_INTERVAL_SECONDS = 10


async def with_sse_heartbeats(
    source: AsyncIterator[str],
    presentation_id: uuid.UUID,
    heartbeat_interval_seconds: int = STREAM_HEARTBEAT_INTERVAL_SECONDS,
):
    iterator = source.__aiter__()
    next_frame_task = asyncio.create_task(iterator.__anext__())
    try:
        while True:
            done, _ = await asyncio.wait({next_frame_task}, timeout=heartbeat_interval_seconds)
            if done:
                try:
                    yield next_frame_task.result()
                except StopAsyncIteration:
                    break
                next_frame_task = asyncio.create_task(iterator.__anext__())
                continue
            logger.debug("[presentation.stream] heartbeat presentation_id=%s", presentation_id)
            yield SSEStatusResponse(status="heartbeat").to_string()
    finally:
        next_frame_task.cancel()
        with suppress(asyncio.CancelledError, StopAsyncIteration):
            await next_frame_task


def insert_toc_layouts(
    structure: PresentationStructureModel,
    n_toc_slides: int,
    include_title_slide: bool,
    toc_slide_layout_index: int,
):
    if n_toc_slides <= 0 or toc_slide_layout_index == -1:
        return
    insertion_index = 1 if include_title_slide else 0
    for i in range(n_toc_slides):
        structure.slides.insert(insertion_index + i, toc_slide_layout_index)


def build_export_cookie_header(request: Request) -> Optional[str]:
    cookie_header = (request.headers.get("cookie") or "").strip()
    if cookie_header:
        return cookie_header
    session_token = get_session_token_from_request(request)
    if session_token:
        return f"{SESSION_COOKIE_NAME}={session_token}"
    username = getattr(request.state, "auth_username", None)
    if isinstance(username, str) and username.strip():
        try:
            session_token = create_session_token(username.strip())
            return f"{SESSION_COOKIE_NAME}={session_token}"
        except Exception:
            logger.exception("[presentation.generate] failed to create export session token")
    return None


def build_export_web_origin(request: Request) -> Optional[str]:
    return resolve_web_origin(
        origin_header=request.headers.get("origin"),
        referer_header=request.headers.get("referer"),
        forwarded_proto=request.headers.get("x-forwarded-proto"),
        forwarded_host=request.headers.get("x-forwarded-host") or request.headers.get("host"),
    )


def build_owner_user_id(request: Request) -> str:
    return resolve_presenton_owner_user_id(getattr(request.state, "current_user", None)) or str(
        getattr(request.state, "ppt_generator_owner_user_id", "")
        or getattr(request.state, "presenton_owner_user_id", "")
    ).strip()


def build_edit_path(presentation_id: uuid.UUID) -> str:
    return f"/presentation?id={presentation_id}"
