"""Shared message builder for LLM provider services.

Extracted from LocalLLMService and DeepSeekService to eliminate ~48 lines of
duplicate context→messages conversion logic.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def build_llm_messages(
    message: str,
    context: Optional[Dict[str, Any]] = None,
    *,
    max_history_turns: int = 12,
    max_content_chars: int = 4000,
    max_message_chars: int = 6000,
) -> List[Dict[str, Any]]:
    """Build a standard OpenAI-compatible messages list from message + context.

    Args:
        message: The current user message.
        context: Optional dict with keys:
            - system_override: Overrides the system prompt.
            - system_memory: Extra system-level context (e.g. student profile).
            - chat_history: Previous conversation turns (list of {role, content}).
            - images: Images to attach to the current message.
    """
    messages: List[Dict[str, Any]] = []

    system_override = str((context or {}).get("system_override", "") or "").strip()
    if system_override:
        messages.append({"role": "system", "content": system_override})

    system_memory = str((context or {}).get("system_memory", "") or "").strip()
    if system_memory:
        messages.append({"role": "system", "content": f"Student profile: {system_memory}"})

    history = (context or {}).get("chat_history") or []
    for item in history[-max_history_turns:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        images = item.get("images", [])

        if role in {"user", "assistant", "system"} and (content or images):
            msg: Dict[str, Any] = {"role": role, "content": content[:max_content_chars]}
            if images:
                msg["images"] = images[:8]
            messages.append(msg)

    current_msg: Dict[str, Any] = {
        "role": "user",
        "content": str(message or "")[:max_message_chars],
    }
    ctx_images = (context or {}).get("images")
    if ctx_images:
        current_msg["images"] = ctx_images
    messages.append(current_msg)

    return messages
