"""Coze V3 streaming SSE client."""
import json
import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)


async def chat_v3_stream(  # noqa: C901
    client: httpx.AsyncClient,
    *,
    chat_url: str,
    api_key: str,
    bot_id: str,
    message: str,
    context: Optional[Dict[str, Any]] = None,
) -> str:
    """Send a streaming V3 chat request and return the assembled answer."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    additional_msgs: list[Dict[str, str]] = []

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

    chat_history = (context or {}).get("chat_history") or []
    for turn in chat_history:
        role = str(turn.get("role", "")).strip().lower() if isinstance(turn, dict) else ""
        content = str(turn.get("content", "")).strip()[:2000] if isinstance(turn, dict) else ""
        if role in ("user", "assistant") and content:
            additional_msgs.append({"role": role, "content": content, "content_type": "text"})

    system_memory = (context or {}).get("system_memory", "").strip()
    final_message = f"[{system_memory}]\n\n{message}" if system_memory else message
    additional_msgs.append({"role": "user", "content": final_message, "content_type": "text"})

    payload: Dict[str, Any] = {
        "bot_id": bot_id,
        "user_id": (context or {}).get("coze_user_id", "teacher_grading"),
        "stream": True,
        "auto_save_history": False,
        "additional_messages": additional_msgs,
    }

    answer_parts: list[str] = []
    completed_answer = ""
    stream_done = False
    async with client.stream("POST", chat_url, json=payload, headers=headers) as resp:
        resp.raise_for_status()

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

                if line.startswith("event:"):
                    current_event = line[len("event:"):].strip()
                    continue
                if not line.startswith("data:"):
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

                event_type = current_event or (data_obj.get("event", "") if isinstance(data_obj, dict) else "")

                if event_type == "conversation.message.delta":
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

                current_event = ""

            if stream_done:
                break

    if answer_parts:
        return "".join(answer_parts)
    if completed_answer:
        return completed_answer
    logger.warning("Coze streaming returned no recognised answer content. bot_id=%s", bot_id)
    return "Coze completed but returned no answer content."
