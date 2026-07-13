from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

MAX_TOOL_ROUNDS = 40


@dataclass(frozen=True)
class ChatTurnResult:
    conversation_id: uuid.UUID
    response_text: str
    tool_calls: list[str]


ChatStreamEventType = Literal["chunk", "complete", "status", "trace"]
ChatStreamEventValue = str | ChatTurnResult | dict[str, Any]
