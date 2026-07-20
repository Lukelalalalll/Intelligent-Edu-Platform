"""Anthropic Claude chat service for user-configured Claude providers."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator, Dict, Optional

import httpx

from backend.config import Config
from backend.infrastructure import TelemetryTimer
from backend.services.llm_service.message_builder import build_llm_messages

logger = logging.getLogger(__name__)

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:png|jpeg|jpg|gif|webp));base64,(?P<data>[A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)


class ClaudeUnavailableError(Exception):
    """Raised when the Claude API returns an error or is unreachable."""


class ClaudeService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        provider_id: str = "claude",
        credential_alias: str = "ANTHROPIC_API_KEY",
    ):
        self.api_key = (api_key or "").strip()
        self.base_url = (base_url or "https://api.anthropic.com/v1").strip().rstrip("/")
        self.model = (model or "claude-sonnet-5").strip()
        self.provider_id = provider_id
        self.credential_alias = credential_alias
        self.timeout_seconds = Config.OPENAI_REQUEST_TIMEOUT_SECONDS

    @classmethod
    def from_config(cls, config: Optional[Dict[str, Any]] = None) -> "ClaudeService":
        cfg = config or {}
        return cls(
            api_key=cfg.get("api_key"),
            base_url=cfg.get("base_url"),
            model=cfg.get("model"),
        )

    @property
    def _messages_url(self) -> str:
        return f"{self.base_url}/messages"

    def _auth_headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key or "",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

    def _build_messages(self, message: str, context: Optional[Dict[str, Any]] = None) -> dict[str, Any]:
        raw_messages = build_llm_messages(message, context)
        return self._to_claude_messages(raw_messages)

    def _to_claude_messages(self, raw_messages: list[dict[str, Any]]) -> dict[str, Any]:
        system_chunks: list[str] = []
        messages: list[dict[str, Any]] = []

        for item in raw_messages:
            role = str(item.get("role") or "").strip().lower()
            content = str(item.get("content") or "").strip()
            images = item.get("images") or []

            if role == "system":
                if content:
                    system_chunks.append(content)
                continue

            if role not in {"user", "assistant"}:
                continue

            blocks: list[dict[str, Any]] = []
            if role == "user":
                for image in images[:8]:
                    image_block = self._build_image_block(image)
                    if image_block is not None:
                        blocks.append(image_block)

            if content:
                blocks.append({"type": "text", "text": content})

            if not blocks:
                continue

            messages.append({"role": role, "content": blocks})

        if not messages:
            messages = [{"role": "user", "content": [{"type": "text", "text": "Hello"}]}]

        payload: dict[str, Any] = {"messages": messages}
        system_text = "\n\n".join(chunk for chunk in system_chunks if chunk)
        if system_text:
            payload["system"] = system_text
        return payload

    def _build_image_block(self, image_value: Any) -> dict[str, Any] | None:
        candidate = str(image_value or "").strip()
        if not candidate:
            return None

        match = _DATA_URL_RE.match(candidate)
        if not match:
            return None

        media_type = match.group(1).lower().replace("jpg", "jpeg")
        data = re.sub(r"\s+", "", match.group("data"))
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": data,
            },
        }

    def _build_payload(self, message: str, context: Optional[Dict[str, Any]], *, stream: bool) -> dict[str, Any]:
        built = self._build_messages(message=message, context=context)
        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": Config.OPENAI_MAX_TOKENS,
            "temperature": Config.OPENAI_TEMPERATURE,
            "stream": stream,
            **built,
        }
        return payload

    @staticmethod
    def _extract_text_content(data: dict[str, Any]) -> str:
        parts: list[str] = []
        for block in data.get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text":
                text = str(block.get("text") or "")
                if text:
                    parts.append(text)
        return "".join(parts).strip()

    async def health_check(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, f"{self.credential_alias} is not set"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    self._messages_url,
                    headers=self._auth_headers(),
                    json={
                        "model": self.model,
                        "max_tokens": 1,
                        "stream": False,
                        "messages": [{"role": "user", "content": [{"type": "text", "text": "ping"}]}],
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
            provider=self.provider_id,
            model=self.model,
            endpoint="chat",
            api_type="chat",
            credential_alias=self.credential_alias,
        )
        payload = self._build_payload(message=message, context=context, stream=False)

        with timer:
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    resp = await client.post(
                        self._messages_url,
                        headers=self._auth_headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
            except Exception as exc:  # noqa: BLE001
                await timer.save(success=False, error=str(exc))
                raise ClaudeUnavailableError(str(exc)) from exc

        content = self._extract_text_content(data)
        if not content:
            raise ClaudeUnavailableError("Claude returned empty content")
        usage = data.get("usage") or {}
        await timer.save(
            prompt_tokens=usage.get("input_tokens", max(1, len(message) // 3)),
            completion_tokens=usage.get("output_tokens", max(1, len(content) // 3)),
        )
        return content

    async def chat_stream(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        payload = self._build_payload(message=message, context=context, stream=True)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    self._messages_url,
                    headers=self._auth_headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[len("data: "):].strip()
                        if not data_str or data_str == "[DONE]":
                            continue
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if data.get("type") != "content_block_delta":
                            continue
                        delta = data.get("delta") or {}
                        text = delta.get("text")
                        if text:
                            yield str(text)
        except Exception as exc:  # noqa: BLE001
            raise ClaudeUnavailableError(str(exc)) from exc
