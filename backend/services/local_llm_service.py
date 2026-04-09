import logging
from typing import Any, Dict, Optional

import httpx

from backend.config import Config
from backend.infrastructure import TelemetryTimer

logger = logging.getLogger(__name__)


class LocalLLMUnavailableError(Exception):
    pass


class LocalLLMService:
    """Simple Ollama wrapper for local text chat."""

    def __init__(self):
        self.base_url = Config.OLLAMA_BASE_URL
        self.model = Config.OLLAMA_MODEL
        self.timeout_seconds = Config.OLLAMA_REQUEST_TIMEOUT_SECONDS

    @property
    def _chat_url(self) -> str:
        return f"{self.base_url}/api/chat"

    @property
    def _tags_url(self) -> str:
        return f"{self.base_url}/api/tags"

    def _build_messages(self, message: str, context: Optional[Dict[str, Any]] = None) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []

        system_override = str((context or {}).get("system_override", "") or "").strip()
        if system_override:
            messages.append({"role": "system", "content": system_override})

        system_memory = str((context or {}).get("system_memory", "") or "").strip()
        if system_memory:
            messages.append({"role": "system", "content": f"Student profile: {system_memory}"})

        history = (context or {}).get("chat_history") or []
        for item in history[-12:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", "")).strip().lower()
            content = str(item.get("content", "")).strip()
            images = item.get("images", [])
            
            if role in {"user", "assistant"} and (content or images):
                msg: dict[str, Any] = {"role": role, "content": content[:4000]}
                if images:
                    msg["images"] = images
                messages.append(msg)

        current_msg: dict[str, Any] = {"role": "user", "content": str(message or "")[:6000]}
        if context and context.get("images"):
            current_msg["images"] = context["images"]
        messages.append(current_msg)

        return messages

    @staticmethod
    def _build_options() -> dict[str, float | int]:
        return {
            "num_predict": 1024,
            "temperature": 0.4,
            "top_p": 0.9,
            "repeat_penalty": 1.05,
            "num_ctx": 8192,
        }

    async def health_check(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(self._tags_url)
            if resp.status_code != 200:
                return False, f"tags endpoint returned status {resp.status_code}"
            data = resp.json() if resp.content else {}
            model_names = {m.get("name") for m in data.get("models", []) if isinstance(m, dict)}
            if self.model and model_names and self.model not in model_names:
                return False, f"model '{self.model}' is not loaded"
            return True, "ok"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        timer = TelemetryTimer(
            provider="local_ollama",
            model=self.model,
            endpoint="chat",
            api_type="chat",
            credential_alias="local",
        )

        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "stream": False,
            "options": self._build_options(),
        }

        with timer:
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    resp = await client.post(self._chat_url, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
            except Exception as exc:  # noqa: BLE001
                await timer.save(success=False, error=str(exc))
                raise LocalLLMUnavailableError(str(exc)) from exc

        content = str((data.get("message") or {}).get("content", "")).strip()
        if not content:
            raise LocalLLMUnavailableError("Local model returned empty content")

        est_prompt_tokens = max(1, len(message) // 3)
        est_completion_tokens = max(1, len(content) // 3)
        await timer.save(
            prompt_tokens=est_prompt_tokens,
            completion_tokens=est_completion_tokens,
        )
        return content

    async def chat_stream(self, message: str, context: Optional[Dict[str, Any]] = None):
        import json
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "stream": True,
            "options": self._build_options(),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream("POST", self._chat_url, json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            msg = data.get("message", {})
                            if content := msg.get("content"):
                                yield content
                        except json.JSONDecodeError:
                            pass
        except Exception as exc:  # noqa: BLE001
            raise LocalLLMUnavailableError(str(exc)) from exc
