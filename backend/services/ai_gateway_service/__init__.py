"""AIGatewayService — thin facade delegating to sub-modules."""
import os
import logging
from typing import Optional, Dict, Any

import httpx
from backend.config import Config
from backend.infrastructure import llm_telemetry, TelemetryTimer
from backend.services.local_llm_service import LocalLLMService, LocalLLMUnavailableError

from backend.services.ai_gateway_service.context_builder import serialize_context
from backend.services.ai_gateway_service.coze_client import chat_v3_stream
from backend.services.ai_gateway_service import grading as _grading_mod

logger = logging.getLogger(__name__)


class AIGatewayService:
    def __init__(self):
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
        return serialize_context(context)

    async def _chat_v3(self, client: httpx.AsyncClient, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        return await chat_v3_stream(
            client,
            chat_url=self.chat_url,
            api_key=self.api_key,
            bot_id=self.bot_id,
            message=message,
            context=context,
        )

    async def _chat_legacy(self, client: httpx.AsyncClient, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        v3_url_backup = self.chat_url
        try:
            self.chat_url = f"{self.api_root}/v3/chat"
            return await self._chat_v3(client, message=message, context=context)
        finally:
            self.chat_url = v3_url_backup

    async def chat(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        return await self.chat_with_provider(message=message, context=context, provider="local_ollama")

    async def chat_with_provider(
        self,
        *,
        message: str,
        context: Optional[Dict[str, Any]] = None,
        provider: str,
        allow_fallback: bool = True,
    ) -> str:
        p = str(provider or self.default_provider or "local_ollama").strip().lower()
        if p == "local_ollama":
            logger.info("Using local_ollama provider")
            local_service = LocalLLMService()
            try:
                is_healthy, msg = await local_service.health_check()
                if not is_healthy:
                    raise LocalLLMUnavailableError(f"Health check failed: {msg}")
                result = await local_service.chat(message=message, context=context)
                return result
            except LocalLLMUnavailableError as e:
                if not allow_fallback:
                    raise
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
            except Exception as exc:
                await timer.save(success=False, error=str(exc))
                return f"Error calling Coze.ai: {exc}"

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
        return await _grading_mod.analyze_submission(
            self.chat_with_provider,
            text=text,
            rubric=rubric,
            assignment=assignment,
            provider=provider,
        )

    async def regrade_single_question(
        self,
        *,
        rubric: Dict[str, Any],
        assignment: str,
        question_id: str,
        question_text: str,
        student_answer: str,
        reference_answer: str,
        key_points: list[str],
        max_score: float,
        provider: str = "local_ollama",
    ) -> Dict[str, Any]:
        return await _grading_mod.regrade_single_question(
            self.chat_with_provider,
            rubric=rubric,
            assignment=assignment,
            question_id=question_id,
            question_text=question_text,
            student_answer=student_answer,
            reference_answer=reference_answer,
            key_points=key_points,
            max_score=max_score,
            provider=provider,
        )

    async def suggest_annotation(self, selected_text: str, rubric: Dict[str, Any], assignment: str) -> str:
        return await _grading_mod.suggest_annotation(
            self.chat_with_provider,
            selected_text=selected_text,
            rubric=rubric,
            assignment=assignment,
        )


# Backward compatibility alias for older imports.
CozeService = AIGatewayService
