import os
import asyncio
import json
from typing import Optional, Dict, Any

import httpx
from backend.config import Config


class CozeService:
    def __init__(self):
        # Support both naming conventions used in this repo/environment.
        self.api_key = os.getenv("COZE_TOKEN") or os.getenv("COZE_API_KEY")
        self.bot_id = (os.getenv("COZE_BOT_ID") or "").strip()
        self.api_root = (os.getenv("COZE_API_ROOT") or "https://api.coze.com").rstrip("/")
        self.chat_url = os.getenv("COZE_API_BASE") or f"{self.api_root}/v3/chat"
        self.poll_interval_seconds = Config.COZE_POLL_INTERVAL_SECONDS
        self.poll_max_attempts = Config.COZE_POLL_MAX_ATTEMPTS
        self.request_timeout_seconds = Config.COZE_REQUEST_TIMEOUT_SECONDS

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
        return context_text[:5000]

    async def _chat_v3(self, client: httpx.AsyncClient, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        context_text = self._serialize_context(context)
        context_block = f"\n\nContext:\n{context_text}" if context_text else ""
        full_prompt = f"{message}{context_block}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "bot_id": self.bot_id,
            "user_id": "teacher_grading",
            "stream": False,
            "additional_messages": [
                {"role": "user", "content": full_prompt, "content_type": "text"}
            ],
        }

        start = await client.post(self.chat_url, json=payload, headers=headers)
        start.raise_for_status()
        start_data = start.json()
        data = start_data.get("data", {})
        chat_id = data.get("id")
        conversation_id = data.get("conversation_id")
        if not chat_id or not conversation_id:
            raise ValueError(f"Invalid Coze v3 response: {start_data}")

        retrieve_url = f"{self.api_root}/v3/chat/retrieve"
        msg_url = f"{self.api_root}/v3/chat/message/list"

        for _ in range(self.poll_max_attempts):
            status_resp = await client.get(
                retrieve_url,
                params={"chat_id": chat_id, "conversation_id": conversation_id},
                headers=headers,
            )
            status_resp.raise_for_status()
            status_data = status_resp.json().get("data", {})
            status = status_data.get("status")

            if status == "completed":
                msg_resp = await client.get(
                    msg_url,
                    params={"chat_id": chat_id, "conversation_id": conversation_id},
                    headers=headers,
                )
                msg_resp.raise_for_status()
                messages = msg_resp.json().get("data", [])
                for msg in messages:
                    if msg.get("type") in {"answer", "assistant_answer"} and msg.get("content"):
                        return msg.get("content")
                    if msg.get("role") == "assistant" and msg.get("content"):
                        return msg.get("content")
                return "Coze completed but returned no answer content."

            if status in {"failed", "canceled", "requires_action"}:
                return f"Coze request ended with status: {status}"

            if status in {"queued", "in_progress", "processing", None, ""}:
                await asyncio.sleep(self.poll_interval_seconds)
                continue

            # Unknown intermediate status, still wait a bit and continue.
            await asyncio.sleep(self.poll_interval_seconds)

        return "Coze response timeout."

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
        """Send a message to Coze.ai and get response."""
        if not self.api_key or not self.bot_id:
            return "[Mock AI] Coze.ai credentials missing; returning placeholder feedback."

        try:
            async with httpx.AsyncClient(timeout=self.request_timeout_seconds) as client:
                if "/v3/chat" in self.chat_url:
                    return await self._chat_v3(client, message=message, context=context)
                return await self._chat_legacy(client, message=message, context=context)
        except Exception as exc:  # noqa: BLE001
            return f"Error calling Coze.ai: {exc}"

    async def analyze_submission(self, text: str, rubric: Dict[str, Any], assignment: str) -> Dict[str, Any]:
        """Analyze full submission with Coze.ai."""
        prompt = f"""
Please analyze this homework submission and provide grading feedback.

Assignment: {assignment}
Rubric: {rubric}

Student submission:
{text[:3000]}

Return a JSON-like summary with:
- overall_score (0-100)
- rubric_scores (object with the rubric categories)
- overall_feedback (paragraph)
- improvement_suggestions (list of strings)
"""
        response = await self.chat(prompt)
        return {"raw_response": response}

    async def suggest_annotation(self, selected_text: str, rubric: Dict[str, Any], assignment: str) -> str:
        """Get AI suggestion for annotating a specific section."""
        prompt = f"""
The student wrote this section:
"{selected_text}"

Assignment: {assignment}
Rubric: {rubric}

Provide a short, constructive feedback comment for this specific section. Be specific and actionable.
Keep it under 100 words.
"""
        return await self.chat(prompt)
