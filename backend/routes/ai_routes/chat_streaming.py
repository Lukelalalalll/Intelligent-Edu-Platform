"""SSE streaming primitives for the /chat endpoint."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator


def sse_meta(meta_dict: dict) -> str:
    """Format a metadata-only SSE frame."""
    return f"data: {json.dumps({'meta': meta_dict}, ensure_ascii=False)}\n\n"


def sse_delta(content: str) -> str:
    """Format a content-delta SSE frame (OpenAI-compatible)."""
    return f"data: {json.dumps({'choices': [{'delta': {'content': content}}]}, ensure_ascii=False)}\n\n"


def sse_think(content: str) -> str:
    """Format a structured think/content SSE frame (DeepSeek reasoning mode)."""
    return f"data: {json.dumps({'type': 'think', 'content': content}, ensure_ascii=False)}\n\n"


def sse_answer(content: str) -> str:
    """Format a structured answer/content SSE frame (DeepSeek reasoning mode)."""
    return f"data: {json.dumps({'type': 'answer', 'content': content}, ensure_ascii=False)}\n\n"


SSE_DONE = "data: [DONE]\n\n"


def sse_error(message: str = "An internal error occurred. Please try again.") -> str:
    return f"data: {json.dumps({'error': message}, ensure_ascii=False)}\n\n"


def sse_tool_progress(name: str, status: str, message: str = "", result: dict = None) -> str:
    """Emit a tool_progress SSE frame for streaming agent feedback."""
    payload = {"tool_progress": {"name": name, "status": status}}
    if message:
        payload["tool_progress"]["message"] = message
    if result:
        payload["tool_progress"]["result"] = result
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def sse_ui_element(element: dict) -> str:
    """Emit a ui_element SSE frame (image, file, choice, diagram)."""
    return f"data: {json.dumps({'ui_element': element}, ensure_ascii=False)}\n\n"


async def stream_text_as_sse(text: str, chunk_size: int = 2, delay: float = 0.01) -> AsyncIterator[str]:
    """Yield *text* as SSE delta frames, character-by-character (with configurable chunk_size)."""
    from .chat_context_helpers import _chunk_text

    for part in _chunk_text(text, size=chunk_size):
        yield sse_delta(part)
        if delay > 0:
            await asyncio.sleep(delay)
