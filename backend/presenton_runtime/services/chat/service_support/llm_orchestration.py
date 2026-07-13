from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from llmai import get_client  # type: ignore[import-not-found]
from llmai.shared import Message, TextContentPart, ToolResponseMessage  # type: ignore[import-not-found]

from services.chat.llm_tools import build_chat_llm_tools
from services.chat.tools import ChatTools
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import extract_text, get_generate_kwargs, stream_generate_events

from .models import MAX_TOOL_ROUNDS, ChatStreamEventType, ChatStreamEventValue
from .tool_feedback import (
    build_tool_limit_fallback,
    event_text,
    summarize_model_note,
    summarize_tool_result,
    tool_focus_from_arguments,
    tool_focus_from_result,
    tool_start_message,
)

LOGGER = logging.getLogger(__name__)


class ChatLlmOrchestrator:
    def __init__(self, tools: ChatTools):
        self._tools = tools

    def build_stream_run(self, messages: list[Message]) -> "StreamingChatRun":
        return StreamingChatRun(orchestrator=self, messages=messages)

    async def run_llm_with_tools(self, messages: list[Message]) -> tuple[str, list[str]]:
        client, model, llm_tools = self._build_runtime()
        called_tools: list[str] = []
        last_tool_results: list[dict[str, Any]] = []
        pending_messages = list(messages)

        for _ in range(MAX_TOOL_ROUNDS):
            try:
                response = await asyncio.to_thread(
                    client.generate,
                    **get_generate_kwargs(
                        model=model,
                        messages=pending_messages,
                        tools=llm_tools,
                    ),
                )
            except Exception as exc:
                raise handle_llm_client_exceptions(exc)

            if not response.tool_calls:
                response_text = extract_text(response.content) or (
                    "I could not generate a response for that request."
                )
                return response_text, called_tools

            called_tools.extend([tool_call.name for tool_call in response.tool_calls])
            pending_messages = list(response.messages) if response.messages else list(pending_messages)

            last_tool_results = []
            for tool_call in response.tool_calls:
                tool_result = await self._tools.execute_tool_call(tool_call)
                last_tool_results.append(tool_result)
                pending_messages.append(
                    ToolResponseMessage(
                        id=tool_call.id,
                        content=[
                            TextContentPart(
                                text=json.dumps(tool_result, ensure_ascii=False)
                            )
                        ],
                    )
                )

        LOGGER.warning("Max tool rounds reached in chat flow")
        final_response = await self._try_final_response_without_tools(
            client=client,
            model=model,
            messages=pending_messages,
        )
        if final_response:
            return final_response, called_tools
        return build_tool_limit_fallback(last_tool_results), called_tools

    def _build_runtime(self) -> tuple[Any, str, list[Any]]:
        client = get_client(config=get_llm_config())
        model = get_model()
        llm_tools = build_chat_llm_tools(self._tools.get_tool_definitions())
        return client, model, llm_tools

    async def _try_final_response_without_tools(
        self,
        *,
        client: Any,
        model: str,
        messages: list[Message],
    ) -> str | None:
        try:
            response = await asyncio.to_thread(
                client.generate,
                **get_generate_kwargs(model=model, messages=messages),
            )
        except Exception:
            LOGGER.warning("Final no-tool synthesis call failed", exc_info=True)
            return None

        return extract_text(response.content)


class StreamingChatRun:
    def __init__(self, *, orchestrator: ChatLlmOrchestrator, messages: list[Message]):
        self._orchestrator = orchestrator
        self._messages = list(messages)
        self.called_tools: list[str] = []
        self.last_tool_results: list[dict[str, Any]] = []
        self.response_text: str | None = None

    async def iterate(
        self,
    ) -> AsyncGenerator[tuple[ChatStreamEventType, ChatStreamEventValue], None]:
        client, model, llm_tools = self._orchestrator._build_runtime()

        for round_index in range(MAX_TOOL_ROUNDS):
            completion_chunk: Any | None = None
            round_content_chunks: list[str] = []
            thinking_chunks: list[str] = []

            try:
                async for event in stream_generate_events(
                    client,
                    **get_generate_kwargs(
                        model=model,
                        messages=self._messages,
                        tools=llm_tools,
                        stream=True,
                    ),
                ):
                    event_type = getattr(event, "type", None)
                    if event_type == "content":
                        chunk = getattr(event, "chunk", None)
                        if chunk:
                            round_content_chunks.append(chunk)
                            yield "chunk", chunk
                    elif event_type == "thinking":
                        thinking_text = event_text(event)
                        if thinking_text:
                            thinking_chunks.append(thinking_text)
                    elif event_type == "completion":
                        completion_chunk = event
            except Exception as exc:
                raise handle_llm_client_exceptions(exc)

            thinking_summary = summarize_model_note(thinking_chunks)
            if thinking_summary:
                yield "trace", {
                    "kind": "model_note",
                    "round": round_index + 1,
                    "status": "info",
                    "message": thinking_summary,
                }

            completion_tool_calls = list(getattr(completion_chunk, "tool_calls", []) or [])
            if completion_tool_calls:
                tool_names = [tool_call.name for tool_call in completion_tool_calls]
                self.called_tools.extend(tool_names)
                yield "trace", {
                    "kind": "tool_plan",
                    "round": round_index + 1,
                    "tools": tool_names,
                    "message": f"Using tools: {', '.join(tool_names)}",
                }
                self._messages = (
                    list(getattr(completion_chunk, "messages", []) or [])
                    if getattr(completion_chunk, "messages", None)
                    else list(self._messages)
                )

                self.last_tool_results = []
                for tool_call in completion_tool_calls:
                    start_trace: dict[str, Any] = {
                        "kind": "tool_call",
                        "round": round_index + 1,
                        "tool": tool_call.name,
                        "status": "start",
                        "message": tool_start_message(tool_call.name),
                    }
                    tool_focus = tool_focus_from_arguments(
                        tool_name=tool_call.name,
                        arguments=tool_call.arguments,
                    )
                    if tool_focus:
                        start_trace.update(tool_focus)
                    yield "trace", start_trace

                    tool_result = await self._orchestrator._tools.execute_tool_call(tool_call)
                    self.last_tool_results.append(tool_result)

                    complete_trace: dict[str, Any] = {
                        "kind": "tool_call",
                        "round": round_index + 1,
                        "tool": tool_call.name,
                        "status": "success" if tool_result.get("ok") else "error",
                        "message": summarize_tool_result(tool_call.name, tool_result),
                    }
                    resolved_tool_focus = tool_focus_from_result(
                        tool_name=tool_call.name,
                        tool_result=tool_result,
                    )
                    if resolved_tool_focus:
                        complete_trace.update(resolved_tool_focus)
                    yield "trace", complete_trace

                    self._messages.append(
                        ToolResponseMessage(
                            id=tool_call.id,
                            content=[
                                TextContentPart(
                                    text=json.dumps(tool_result, ensure_ascii=False)
                                )
                            ],
                        )
                    )
                continue

            self.response_text = "".join(round_content_chunks)
            if not self.response_text and completion_chunk:
                self.response_text = extract_text(getattr(completion_chunk, "content", None))
            if not self.response_text:
                self.response_text = "I could not generate a response for that request."

            if not round_content_chunks:
                yield "chunk", self.response_text
            break
        else:
            LOGGER.warning("Max tool rounds reached in chat stream flow")
            yield "trace", {
                "kind": "limit",
                "message": (
                    "Reached tool-call limit before final answer; "
                    "attempting best-effort summary."
                ),
            }
            yield "status", "Finalizing response"
            self.response_text = await self._orchestrator._try_final_response_without_tools(
                client=client,
                model=model,
                messages=self._messages,
            )
            if not self.response_text:
                self.response_text = build_tool_limit_fallback(self.last_tool_results)
            yield "chunk", self.response_text

        final_response_text = self.response_text or "I could not generate a response for that request."
        if self.response_text is None:
            yield "chunk", final_response_text
        self.response_text = final_response_text
