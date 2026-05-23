"""LLM Provider Protocol — formal interface for LLM service implementations."""
from __future__ import annotations

from typing import Any, AsyncIterator, Dict, Optional, Protocol


class LLMProvider(Protocol):
    """Protocol that all LLM provider services must satisfy."""

    async def chat(
        self, message: str, context: Optional[Dict[str, Any]] = None
    ) -> str: ...

    async def chat_with_tools(
        self,
        message: str,
        tools: list[dict] = None,
        context: Optional[Dict[str, Any]] = None,
        raw_messages: list[dict] = None,
    ) -> dict: ...

    async def chat_stream(
        self, message: str, context: Optional[Dict[str, Any]] = None
    ) -> AsyncIterator[str]: ...

    async def health_check(self) -> tuple[bool, str]: ...
