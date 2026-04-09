import os
import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any

import httpx
from backend.config import Config
from backend.prompts import prompt_registry
from backend.infrastructure import llm_telemetry, TelemetryTimer
from backend.services.local_llm_service import LocalLLMService, LocalLLMUnavailableError

logger = logging.getLogger(__name__)


class AIGatewayService:
    def __init__(self):
        # Support both naming conventions used in this repo/environment.
        self.api_key = os.getenv("COZE_TOKEN") or os.getenv("COZE_API_KEY")
        self.bot_id = (os.getenv("COZE_BOT_ID") or "").strip()
        self.api_root = (os.getenv("COZE_API_ROOT") or "https://api.coze.com").rstrip("/")
        self.chat_url = os.getenv("COZE_API_BASE") or f"{self.api_root}/v3/chat"
        self.poll_interval_seconds = Config.COZE_POLL_INTERVAL_SECONDS
        self.poll_max_attempts = Config.COZE_POLL_MAX_ATTEMPTS
        self.request_timeout_seconds = Config.COZE_REQUEST_TIMEOUT_SECONDS
        self.default_provider = Config.AI_DEFAULT_PROVIDER
        self.local_llm = LocalLLMService()

        if not self.bot_id:
            logger.warning("COZE_BOT_ID is not configured — Coze AI features will be degraded")

    async def check_provider_health(self, provider: str) -> tuple[bool, str]:
        p = str(provider or "").strip().lower()
        if p == "local_ollama":
            return await self.local_llm.health_check()
        if p == "coze":
            if not self.api_key or not self.bot_id:
                return False, "COZE_TOKEN or COZE_BOT_ID is missing"
            return True, "ok"
        return False, "Unknown provider"

    def _serialize_context(self, context: Optional[Dict[str, Any]] = None) -> str:
        """Convert context to bounded text payload to keep Coze requests stable."""
        if not context:
            return ""

        compact = dict(context)

        # Keep only recent chat turns and trim each turn length.
        chat_history = compact.get("chat_history") or []
        if isinstance(chat_history, list):
            compact["chat_history"] = [
                {
                    "role": str(item.get("role", ""))[:16],
                    "content": str(item.get("content", ""))[:400],
                }
                for item in chat_history[-6:]
                if isinstance(item, dict)
            ]

        # Trim RAG chunk text size to reduce latency and provider truncation risk.
        rag = compact.get("rag") or {}
        if isinstance(rag, dict):
            chunks = rag.get("retrieved_chunks") or []
            trimmed_chunks = []
            for chunk in chunks[:3]:
                if not isinstance(chunk, dict):
                    continue
                trimmed_chunks.append(
                    {
                        "chunk_id": chunk.get("chunk_id"),
                        "score": chunk.get("score"),
                        "text": str(chunk.get("text", ""))[:600],
                    }
                )
            compact["rag"] = {
                "retrieved_count": len(trimmed_chunks),
                "retrieved_chunks": trimmed_chunks,
            }

        context_text = json.dumps(compact, ensure_ascii=False)
        return context_text[:15000]

    async def _chat_v3(self, client: httpx.AsyncClient, message: str, context: Optional[Dict[str, Any]] = None) -> str:  # noqa: C901  # NOSONAR
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Build additional_messages as real multi-turn conversation
        additional_msgs: list[Dict[str, str]] = []

        # If a system_override is provided (e.g. Socratic prompt for students),
        # inject it as the first user message so the Coze bot receives the instructions.
        system_override = (context or {}).get("system_override")
        if system_override:
            additional_msgs.append({
                "role": "user",
                "content": f"[System Instructions — follow strictly]\n{system_override}",
                "content_type": "text",
            })
            additional_msgs.append({
                "role": "assistant",
                "content": "Understood. I will follow these instructions for all subsequent messages.",
                "content_type": "text",
            })

        # Add chat history as proper alternating user/assistant turns
        chat_history = (context or {}).get("chat_history") or []
        for turn in chat_history:
            role = str(turn.get("role", "")).strip().lower() if isinstance(turn, dict) else ""
            content = str(turn.get("content", "")).strip()[:2000] if isinstance(turn, dict) else ""
            if role in ("user", "assistant") and content:
                additional_msgs.append({"role": role, "content": content, "content_type": "text"})

        # Current user message — merge system_memory into it (not a separate msg)
        system_memory = (context or {}).get("system_memory", "").strip()
        final_message = f"[{system_memory}]\n\n{message}" if system_memory else message
        additional_msgs.append({"role": "user", "content": final_message, "content_type": "text"})

        payload: Dict[str, Any] = {
            "bot_id": self.bot_id,
            "user_id": (context or {}).get("coze_user_id", "teacher_grading"),
            "stream": True,
            "auto_save_history": False,
            "additional_messages": additional_msgs,
        }

        # Streaming mode: read SSE events and accumulate the answer
        answer_parts: list[str] = []
        completed_answer = ""   # fallback: content from conversation.message.completed type=answer
        stream_done = False
        async with client.stream("POST", self.chat_url, json=payload, headers=headers) as resp:
            resp.raise_for_status()

            # Coze sometimes returns a plain JSON error body with status 200.
            # Detect by checking Content-Type; SSE should be text/event-stream.
            ct = (resp.headers.get("content-type") or "").lower()
            if "text/event-stream" not in ct:
                raw_body = ""
                async for chunk in resp.aiter_text():
                    raw_body += chunk
                    if len(raw_body) > 4000:
                        break
                try:
                    err_obj = json.loads(raw_body)
                    code = err_obj.get("code", "")
                    msg = err_obj.get("msg") or err_obj.get("message") or raw_body[:300]
                    logger.error("Coze returned non-SSE response (code=%s): %s", code, msg)
                    return f"Coze API error (code {code}): {msg}"
                except json.JSONDecodeError:
                    logger.error("Coze returned non-SSE, non-JSON response: %s", raw_body[:500])
                    return f"Coze API returned unexpected response: {raw_body[:300]}"

            buffer = ""
            current_event = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()

                    # SSE format: "event: <type>" then "data: <json>" then blank line
                    if line.startswith("event:"):
                        current_event = line[len("event:"):].strip()
                        continue
                    if not line.startswith("data:"):
                        # Blank line = end of SSE block, reset event
                        if not line:
                            current_event = ""
                        continue

                    data_str = line[len("data:"):].strip()
                    if data_str in ("[DONE]", '""', ""):
                        continue
                    try:
                        data_obj = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    # Coze may also put "event" inside the JSON envelope
                    event_type = current_event or (data_obj.get("event", "") if isinstance(data_obj, dict) else "")

                    if event_type == "conversation.message.delta":
                        # Only accumulate "answer" type deltas; skip verbose/function_call/tool_output
                        if isinstance(data_obj, dict) and data_obj.get("type") == "answer":
                            token = data_obj.get("content", "")
                        elif isinstance(data_obj, str):
                            try:
                                parsed = json.loads(data_obj)
                                token = parsed.get("content", "") if parsed.get("type") == "answer" else ""
                            except (json.JSONDecodeError, AttributeError):
                                token = ""
                        else:
                            token = ""
                        if token:
                            answer_parts.append(token)

                    elif event_type == "conversation.message.completed":
                        msg_data = data_obj
                        if isinstance(msg_data, str):
                            try:
                                msg_data = json.loads(msg_data)
                            except (json.JSONDecodeError, AttributeError):
                                msg_data = {}
                        # Store as fallback; don't early-return so we can collect all parts
                        if isinstance(msg_data, dict) and msg_data.get("type") == "answer":
                            content = msg_data.get("content", "")
                            if content:
                                completed_answer = content

                    elif event_type in ("conversation.chat.completed", "done"):
                        stream_done = True
                        break

                    elif event_type == "error":
                        logger.error("Coze stream error: %s", data_obj)
                        return f"Coze error: {data_obj}"

                    # Reset after processing
                    current_event = ""

                if stream_done:
                    break

        if answer_parts:
            return "".join(answer_parts)
        if completed_answer:
            return completed_answer
        logger.warning("Coze streaming returned no recognised answer content. bot_id=%s", self.bot_id)
        return "Coze completed but returned no answer content."

    async def _chat_legacy(self, client: httpx.AsyncClient, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "bot_id": self.bot_id,
            "user_id": "teacher_grading",
            "message": message,
        }
        if context:
            payload["additional_messages"] = [{"role": "system", "content": f"Context: {context}"}]

        response = await client.post(self.chat_url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        if data.get("message"):
            return data.get("message")
        if data.get("data", {}).get("message"):
            return data.get("data", {}).get("message")
        return str(data)

    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Backward compatible signature. Default to local_ollama."""
        return await self.chat_with_provider(message=message, context=context, provider="local_ollama")

    async def chat_with_provider(
        self,
        *,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        provider: str,
    ) -> str:
        p = str(provider or self.default_provider or "local_ollama").strip().lower()
        if p == "local_ollama":
            from backend.services.local_llm_service import LocalLLMService, LocalLLMUnavailableError
            logger.info("Using local_ollama provider")
            local_service = LocalLLMService()
            try:
                # Check health before generation
                is_healthy, msg = await local_service.health_check()
                if not is_healthy:
                    raise LocalLLMUnavailableError(f"Health check failed: {msg}")
                result = await local_service.chat(message=message, context=context)
                return result
            except LocalLLMUnavailableError as e:
                logger.error(f"Local LLM unavailable: {str(e)}. Falling back to Coze.")
                if context is None:
                    context = {}
                context["fallback_from"] = "local_ollama"
                p = "coze"
        
        if p != "coze":
            raise ValueError(f"Unsupported provider: {p}")

        if not self.api_key or not self.bot_id:
            return "[Mock AI] Coze.ai credentials missing; returning placeholder feedback."

        timer = TelemetryTimer(
            provider="coze", model=self.bot_id,
            endpoint="chat", api_type="chat",
            credential_alias="COZE_TOKEN",
        )
        with timer:
            try:
                async with httpx.AsyncClient(timeout=self.request_timeout_seconds) as client:
                    if "/v3/chat" in self.chat_url:
                        result = await self._chat_v3(client, message=message, context=context)
                    else:
                        result = await self._chat_legacy(client, message=message, context=context)
            except Exception as exc:  # noqa: BLE001
                await timer.save(success=False, error=str(exc))
                return f"Error calling Coze.ai: {exc}"

        # Estimate tokens: ~1 token per 2.5 chars for Chinese-heavy text
        est_prompt_tokens = max(1, len(message) // 3)
        est_completion_tokens = max(1, len(result) // 3)
        await timer.save(
            prompt_tokens=est_prompt_tokens,
            completion_tokens=est_completion_tokens,
        )
        return result

    async def analyze_submission(
        self,
        text: str,
        rubric: Dict[str, Any],
        assignment: str,
        provider: str = "local_ollama",
    ) -> Dict[str, Any]:
        """Analyze full submission with the selected provider."""
        trimmed_text = (text or "")[:12000]
        rubric_json = json.dumps(rubric or {}, ensure_ascii=False)
        prompt = prompt_registry.render(
            "grading", "analyze_submission",
            assignment=assignment,
            rubric_json=rubric_json,
            text=trimmed_text,
        )
        response = await self.chat_with_provider(message=prompt, context=None, provider=provider)
        return {"raw_response": response}

    async def suggest_annotation(self, selected_text: str, rubric: Dict[str, Any], assignment: str) -> str:
        """Get AI suggestion for annotating a specific section."""
        prompt = prompt_registry.render(
            "grading", "suggest_annotation",
            selected_text=selected_text,
            assignment=assignment,
            rubric=rubric,
        )
        return await self.chat(prompt)




# Backward compatibility alias for older imports.
CozeService = AIGatewayService
