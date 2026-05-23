"""
DeepSeek API service — OpenAI-compatible chat & streaming wrapper.

Supports chat, streaming, and tool-calling via
https://api.deepseek.com/v1/chat/completions
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, Optional

import httpx

from backend.config import Config
from backend.infrastructure import TelemetryTimer
from backend.services.llm_service.message_builder import build_llm_messages

logger = logging.getLogger(__name__)


class DeepSeekUnavailableError(Exception):
    """Raised when the DeepSeek API returns an error or is unreachable."""


class DeepSeekService:
    """Thin wrapper around the DeepSeek API (OpenAI-compatible /v1/chat/completions)."""

    def __init__(self):
        self.api_key = Config.DEEPSEEK_API_KEY
        self.base_url = Config.DEEPSEEK_BASE_URL.rstrip("/")
        self.model = Config.DEEPSEEK_MODEL
        self.timeout_seconds = Config.DEEPSEEK_REQUEST_TIMEOUT_SECONDS

    @property
    def _chat_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key or ''}",
            "Content-Type": "application/json",
        }

    def _build_messages(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """Build OpenAI-format messages from message + optional context."""
        return build_llm_messages(message, context)

    async def health_check(self) -> tuple[bool, str]:
        """Quick connectivity check using a minimal chat completion."""
        if not self.api_key:
            return False, "DEEPSEEK_API_KEY is not set"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    self._chat_url,
                    headers=self._auth_headers(),
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                        "stream": False,
                    },
                )
            if resp.status_code == 200:
                return True, "ok"
            if resp.status_code == 401 or resp.status_code == 403:
                return False, f"Authentication failed (status {resp.status_code})"
            return False, f"API returned status {resp.status_code}"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    async def chat(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Non-streaming chat completion."""
        timer = TelemetryTimer(
            provider="deepseek",
            model=self.model,
            endpoint="chat",
            api_type="chat",
            credential_alias="DEEPSEEK_API_KEY",
        )

        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "temperature": Config.DEEPSEEK_TEMPERATURE,
            "max_tokens": Config.DEEPSEEK_MAX_TOKENS,
            "reasoning_effort": "high",
            "thinking": {"type": "enabled"},
            "stream": False,
        }

        with timer:
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    resp = await client.post(
                        self._chat_url,
                        headers=self._auth_headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
            except Exception as exc:  # noqa: BLE001
                await timer.save(success=False, error=str(exc))
                raise DeepSeekUnavailableError(str(exc)) from exc

        content_obj = data.get("choices", [{}])[0].get("message", {})
        
        reasoning = content_obj.get("reasoning_content", "")
        content = str(content_obj.get("content", "")).strip()

        if reasoning:
            content = f"<think>\n{reasoning.strip()}\n</think>\n{content}"
            
        if not content:
            raise DeepSeekUnavailableError("DeepSeek returned empty content")

        usage = data.get("usage", {})
        await timer.save(
            prompt_tokens=usage.get("prompt_tokens", max(1, len(message) // 3)),
            completion_tokens=usage.get("completion_tokens", max(1, len(content) // 3)),
        )
        return content

    async def chat_with_tools(
        self,
        message: str,
        tools: list[dict] = None,
        context: Optional[Dict[str, Any]] = None,
        raw_messages: list[dict] = None,
    ) -> dict:
        """Chat with tool calling support. Returns {"content": ..., "tool_calls": ...}."""
        messages_payload = (
            raw_messages
            if raw_messages is not None
            else self._build_messages(message=message, context=context)
        )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages_payload,
            "temperature": Config.DEEPSEEK_TEMPERATURE,
            "max_tokens": Config.DEEPSEEK_MAX_TOKENS,
            "reasoning_effort": "high",
            "thinking": {"type": "enabled"},
            "stream": False,
        }
        if tools:
            payload["tools"] = tools

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(
                    self._chat_url,
                    headers=self._auth_headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            raise DeepSeekUnavailableError(str(exc)) from exc

        msg = data.get("choices", [{}])[0].get("message", {})
        
        reasoning = msg.get("reasoning_content", "")
        content = msg.get("content", "")
        if reasoning:
            content = f"<think>\n{reasoning.strip()}\n</think>\n{content}"
            
        return {
            "content": content,
            "tool_calls": msg.get("tool_calls"),
        }

    async def chat_stream(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        *,
        enable_thinking: bool = True,
    ) -> AsyncIterator[str]:
        """Streaming chat completion — yields raw text chunks.

        When enable_thinking=True, uses DeepSeek's reasoning_effort + thinking mode.
        Each yielded string is a text delta (OpenAI-compatible, plain text mode).
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "temperature": Config.DEEPSEEK_TEMPERATURE,
            "max_tokens": Config.DEEPSEEK_MAX_TOKENS,
            "stream": True,
        }

        if enable_thinking:
            payload["reasoning_effort"] = "high"
            payload["thinking"] = {"type": "enabled"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    self._chat_url,
                    headers=self._auth_headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    
                    has_started_thinking = False
                    has_finished_thinking = False
                    
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[len("data: "):]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            
                            reasoning = delta.get("reasoning_content", "")
                            if reasoning:
                                if not has_started_thinking:
                                    has_started_thinking = True
                                    yield "<think>\n"
                                yield reasoning
                                
                            content = delta.get("content", "")
                            if content:
                                if has_started_thinking and not has_finished_thinking:
                                    has_finished_thinking = True
                                    yield "\n</think>\n"
                                yield content
                        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                            continue
                            
                    if has_started_thinking and not has_finished_thinking:
                        yield "\n</think>\n"
                        
        except Exception as exc:  # noqa: BLE001
            raise DeepSeekUnavailableError(str(exc)) from exc

    async def chat_stream_structured(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[dict]:
        """Streaming chat completion — yields structured dicts.

        Each yielded dict is one of:
          {"type": "think", "content": "..."}   — reasoning/thinking content
          {"type": "answer", "content": "..."}  — final answer content

        Used by the frontend to render the thinking process separately in the UI
        with animations that collapse when the answer starts appearing.
        """
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "temperature": Config.DEEPSEEK_TEMPERATURE,
            "max_tokens": Config.DEEPSEEK_MAX_TOKENS,
            "reasoning_effort": "high",
            "thinking": {"type": "enabled"},
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    self._chat_url,
                    headers=self._auth_headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[len("data: "):]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            
                            reasoning = delta.get("reasoning_content", "")
                            if reasoning:
                                yield {"type": "think", "content": reasoning}
                                
                            content = delta.get("content", "")
                            if content:
                                yield {"type": "answer", "content": content}
                        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                            continue
                        
        except Exception as exc:  # noqa: BLE001
            raise DeepSeekUnavailableError(str(exc)) from exc