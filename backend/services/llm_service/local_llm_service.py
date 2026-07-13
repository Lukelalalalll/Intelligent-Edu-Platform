import logging
from typing import Any, Dict, Optional

import httpx

from backend.config import Config
from backend.infrastructure import TelemetryTimer
from backend.services.llm_service.message_builder import build_llm_messages

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
        return build_llm_messages(message, context)

    @staticmethod
    def _build_options(task_profile: str = "heavy") -> dict[str, float | int]:
        profile = str(task_profile or "heavy").strip().lower()
        if profile == "light":
            return {
                "num_predict": Config.OLLAMA_LIGHT_NUM_PREDICT,
                "temperature": Config.OLLAMA_LIGHT_TEMPERATURE,
                "top_p": 0.9,
                "repeat_penalty": 1.05,
                "num_ctx": Config.OLLAMA_LIGHT_NUM_CTX,
            }
        return {
            "num_predict": Config.OLLAMA_HEAVY_NUM_PREDICT,
            "temperature": Config.OLLAMA_HEAVY_TEMPERATURE,
            "top_p": 0.9,
            "repeat_penalty": 1.05,
            "num_ctx": Config.OLLAMA_HEAVY_NUM_CTX,
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

        task_profile = str((context or {}).get("task_profile", "heavy") or "heavy")
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "stream": False,
            "options": self._build_options(task_profile=task_profile),
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

    async def chat_with_tools(self, message: str, tools: list[dict] = None, context: Optional[Dict[str, Any]] = None, raw_messages: list[dict] = None) -> dict:
        """
        Chat with tool calling support.
        Returns: {
            "content": str | None,
            "tool_calls": list[dict] | None
        }
        """
        task_profile = str((context or {}).get("task_profile", "heavy") or "heavy")
        
        messages_payload = raw_messages if raw_messages is not None else self._build_messages(message=message, context=context)
        
        payload = {
            "model": self.model,
            "messages": messages_payload,
            "stream": False,
            "options": self._build_options(task_profile=task_profile),
        }
        if tools:
            payload["tools"] = tools
            
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                resp = await client.post(self._chat_url, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            raise LocalLLMUnavailableError(str(exc)) from exc
            
        message_data = data.get("message", {})
        return {
            "content": message_data.get("content", ""),
            "tool_calls": message_data.get("tool_calls")
        }

    async def chat_stream(self, message: str, context: Optional[Dict[str, Any]] = None):
        import json
        task_profile = str((context or {}).get("task_profile", "heavy") or "heavy")
        payload = {
            "model": self.model,
            "messages": self._build_messages(message=message, context=context),
            "stream": True,
            "options": self._build_options(task_profile=task_profile),
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
