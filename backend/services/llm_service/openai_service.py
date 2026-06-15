"""OpenAI-compatible chat service for user-configured OpenAI providers."""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Dict, Optional
import json

import httpx

from backend.config import Config
from backend.infrastructure import TelemetryTimer
from backend.services.llm_service.message_builder import build_llm_messages

logger = logging.getLogger(__name__)


class OpenAIUnavailableError(Exception):
    """Raised when the OpenAI-compatible API returns an error or is unreachable."""


class OpenAIService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.api_key = (api_key or Config.OPENAI_API_KEY or "").strip()
        self.base_url = (base_url or Config.OPENAI_BASE_URL).rstrip("/")
        self.model = (model or Config.OPENAI_MODEL).strip()
        self.timeout_seconds = Config.OPENAI_REQUEST_TIMEOUT_SECONDS

    @classmethod
    def from_config(cls, config: Optional[Dict[str, Any]] = None) -> "OpenAIService":
        cfg = config or {}
        return cls(
            api_key=cfg.get("api_key"),
            base_url=cfg.get("base_url"),
            model=cfg.get("model"),
        )

    @property
    def _chat_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key or ''}",
            "Content-Type": "application/json",
        }

    def _build_messages(self, message: str, context: Optional[Dict[str, Any]] = None) -> list[dict[str, Any]]:
        return build_llm_messages(message, context)

    async def health_check(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "OPENAI_API_KEY is not set"
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
            if resp.status_code in (401, 403):
                return False, f"Authentication failed (status {resp.status_code})"
            return False, f"API returned status {resp.status_code}"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        timer = TelemetryTimer(
            provider="openai",
            model=self.model,
            endpoint="chat",
            api_type="chat",
            credential_alias="OPENAI_API_KEY",
        )
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "temperature": Config.OPENAI_TEMPERATURE,
            "max_tokens": Config.OPENAI_MAX_TOKENS,
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
                raise OpenAIUnavailableError(str(exc)) from exc

        content = str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        if not content:
            raise OpenAIUnavailableError("OpenAI returned empty content")
        usage = data.get("usage", {})
        await timer.save(
            prompt_tokens=usage.get("prompt_tokens", max(1, len(message) // 3)),
            completion_tokens=usage.get("completion_tokens", max(1, len(content) // 3)),
        )
        return content

    async def chat_stream(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "temperature": Config.OPENAI_TEMPERATURE,
            "max_tokens": Config.OPENAI_MAX_TOKENS,
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
                        data_str = line[len("data: "):].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield str(content)
        except Exception as exc:  # noqa: BLE001
            raise OpenAIUnavailableError(str(exc)) from exc
