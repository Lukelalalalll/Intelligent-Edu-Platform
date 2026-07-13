import logging
from typing import Any

from llmai.shared import AssistantToolCall, Tool  # type: ignore[import-not-found]

from services.chat.presentation_context_store import PresentationContextStore
from services.chat.tools_support.definitions import build_tool_definitions, build_tool_handlers
from services.chat.tools_support.parsing import parse_tool_arguments

LOGGER = logging.getLogger(__name__)

class ChatTools:
    def __init__(self, memory: PresentationContextStore):
        self._tool_handlers = build_tool_handlers(memory)

    def get_tool_definitions(self) -> list[Tool]:
        return build_tool_definitions()

    async def execute_tool_call(self, tool_call: AssistantToolCall) -> dict[str, Any]:
        handler = self._tool_handlers.get(tool_call.name)
        if not handler:
            return {
                "ok": False,
                "tool": tool_call.name,
                "error": f"Unsupported tool: {tool_call.name}",
            }

        try:
            parsed_args = parse_tool_arguments(tool_call.arguments)
            LOGGER.info("Executing chat tool %s", tool_call.name)
            result = await handler(parsed_args)
            return {"ok": True, "tool": tool_call.name, "result": result}
        except Exception as exc:
            LOGGER.exception("Chat tool failed: %s", tool_call.name)
            return {
                "ok": False,
                "tool": tool_call.name,
                "error": str(exc),
            }
