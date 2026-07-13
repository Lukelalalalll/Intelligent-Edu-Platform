"""Streaming ReAct Agent — yields SSE frames as tool calls progress.

The agent runs the classic ReAct loop (Reason + Act) but yields structured
SSE events for every step so the frontend can show live progress.
"""

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

from backend.agent.tools import tool_registry
from backend.services.llm_service.local_llm_service import LocalLLMService

# Import default_tools to register them with the ToolRegistry at startup
import backend.agent.default_tools  # noqa: F401 — side-effect: registers tools

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5

# ── SSE event helpers (kept here to avoid circular imports) ──────────

def _sse_tool_progress(name: str, status: str, message: str = "") -> str:
    payload = {"tool_progress": {"name": name, "status": status}}
    if message:
        payload["tool_progress"]["message"] = message
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_ui_element(element: dict) -> str:
    return f"data: {json.dumps({'ui_element': element}, ensure_ascii=False)}\n\n"


def _sse_delta(content: str) -> str:
    return f"data: {json.dumps({'choices': [{'delta': {'content': content}}]}, ensure_ascii=False)}\n\n"


# ── Agent ─────────────────────────────────────────────────────────────

class AgentResult:
    """Collected result after the agent finishes all iterations."""
    def __init__(
        self,
        answer: str = "",
        tool_calls_made: int = 0,
        ui_elements: Optional[List[Dict]] = None,
    ):
        self.answer = answer
        self.tool_calls_made = tool_calls_made
        self.ui_elements = ui_elements or []


class ReActAgent:
    """ReAct agent that streams tool progress & results via an async generator."""

    MAX_ITERATIONS = MAX_ITERATIONS

    def __init__(self, llm_service: LocalLLMService):
        self.llm = llm_service
        self.tools = tool_registry

    def _build_messages(
        self,
        user_message: str,
        chat_history: Optional[List[Dict]] = None,
    ) -> List[Dict]:
        msgs = [
            {
                "role": "system",
                "content": (
                    "You are a helpful teaching assistant with access to tools. "
                    "Use tools to search course materials, generate diagrams, "
                    "create slides, or extract PDF content when needed. "
                    "Always answer in the user's language (Chinese or English). "
                    "When a tool returns a ui_element, describe the result to the user."
                ),
            }
        ]
        for item in chat_history or []:
            if isinstance(item, dict) and "role" in item and "content" in item:
                msgs.append({"role": item["role"], "content": item["content"]})
        if user_message:
            msgs.append({"role": "user", "content": user_message})
        return msgs

    async def run_stream(
        self,
        user_message: str,
        chat_history: Optional[List[Dict]] = None,
        context: Optional[Dict] = None,
    ) -> AsyncIterator[str]:
        """Run the ReAct loop, yielding SSE frames as events happen.

        Yields:
            - tool_progress SSE frames before/after each tool call
            - ui_element SSE frames when tools produce visual elements
            - content delta SSE frames for the final answer
        """
        messages = self._build_messages(user_message, chat_history)
        ui_elements: List[Dict] = []
        tool_calls_made = 0
        final_answer = ""

        for iteration in range(self.MAX_ITERATIONS):
            response = await self.llm.chat_with_tools(
                message="",
                raw_messages=messages,
                tools=self.tools.get_schemas(),
                context=context,
            )

            tool_calls = response.get("tool_calls")
            content = response.get("content", "")

            # If there's content and no tool calls, we're done
            if content and not tool_calls:
                final_answer = content
                break

            # If there are tool calls, execute them and emit progress
            if tool_calls:
                tool_calls_made += len(tool_calls)
                if not content:
                    messages.append({"role": "assistant", "content": "", "tool_calls": tool_calls})
                else:
                    messages.append({"role": "assistant", "content": content})

                for tc in tool_calls:
                    fn_details = tc.get("function", {})
                    name = fn_details.get("name", "unknown")
                    args = fn_details.get("arguments", {})

                    # Emit "running" progress
                    yield _sse_tool_progress(name, "running", f"Calling {name}...")

                    try:
                        result_str = await self.tools.execute(name, args)
                        result_str = str(result_str)

                        # Check if the result contains a ui_element
                        try:
                            result_data = json.loads(result_str)
                            if isinstance(result_data, dict) and "ui_element" in result_data:
                                ui_elements.append({
                                    "tool": name,
                                    "status": result_data.get("status", "success"),
                                    "element": result_data["ui_element"],
                                })
                                yield _sse_ui_element(result_data["ui_element"])
                                # Give the LLM a textual summary
                                el_type = result_data["ui_element"].get("type", "unknown")
                                result_str = (
                                    result_data.get("message", "")
                                    or f"Successfully produced a {el_type} for the user."
                                )
                        except (json.JSONDecodeError, TypeError):
                            pass  # result is plain text — fine

                        # Emit "done" progress
                        yield _sse_tool_progress(
                            name, "done",
                            f"Tool {name} completed successfully.",
                        )

                        messages.append({
                            "role": "tool",
                            "name": name,
                            "content": result_str,
                        })

                    except Exception as exc:
                        logger.exception("Tool %s execution failed", name)
                        yield _sse_tool_progress(
                            name, "error",
                            f"Tool {name} failed: {str(exc)}",
                        )
                        messages.append({
                            "role": "tool",
                            "name": name,
                            "content": f"Tool execution error: {str(exc)}",
                        })

                # Continue loop — LLM will respond to tool outputs
                continue

            # No tool calls and no content — guard against empty response
            if content:
                final_answer = content
                break
            else:
                logger.warning("ReActAgent iteration %d: LLM returned empty response with no tool calls", iteration)
                final_answer = "I wasn't able to process that request. Could you try rephrasing?"
                break

        if not final_answer:
            final_answer = "I've completed the requested actions."

        # Send the final answer as SSE deltas (like stream_text_as_sse but async)
        for chunk in _chunk_text(final_answer, size=2):
            yield _sse_delta(chunk)

        # Store results on the generator for post-hoc collection
        self._last_result = AgentResult(
            answer=final_answer,
            tool_calls_made=tool_calls_made,
            ui_elements=ui_elements,
        )

    async def run(
        self,
        user_message: str,
        chat_history: Optional[List[Dict]] = None,
        context: Optional[Dict] = None,
    ) -> AgentResult:
        """Non-streaming convenience wrapper — consumes the full stream."""
        ui_elements: List[Dict] = []
        final_parts: List[str] = []
        tool_calls_made = 0

        async for frame in self.run_stream(user_message, chat_history, context):
            try:
                if not frame.startswith("data: "):
                    continue
                raw = frame[len("data: "):]
                if raw == "[DONE]":
                    continue
                obj = json.loads(raw)
                if "ui_element" in obj:
                    ui_elements.append({"element": obj["ui_element"]})
                if obj.get("choices", [{}])[0].get("delta", {}).get("content"):
                    final_parts.append(obj["choices"][0]["delta"]["content"])
            except (json.JSONDecodeError, IndexError, KeyError):
                pass

        # Try to get the structured result from the generator
        if hasattr(self, "_last_result"):
            result = self._last_result
            result.answer = result.answer or "".join(final_parts)
            result.ui_elements = result.ui_elements or ui_elements
            return result

        return AgentResult(
            answer="".join(final_parts) or "Action completed.",
            tool_calls_made=tool_calls_made if hasattr(self, "_last_result") else 0,
            ui_elements=ui_elements,
        )


def _chunk_text(text: str, size: int = 2):
    """Yield text in character-sized chunks (imported inline to avoid circular deps)."""
    for i in range(0, len(text), size):
        yield text[i:i + size]