from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from services.chat.tools import ChatTools


class _FakeMemory:
    def __init__(self):
        self.saved_payload = None

    async def get(self, key: str):
        assert key == "presentation_outline"
        return {
            "source": "slides_table",
            "slides": [{"index": 1, "content": "# Agenda\n- item"}],
        }

    async def save_slide(self, **kwargs):
        self.saved_payload = kwargs
        return {"saved": True, "resolved_index": kwargs["index"]}


def test_chat_tools_outline_uses_extracted_titles():
    tools = ChatTools(_FakeMemory())

    result = asyncio.run(
        tools.execute_tool_call(
            SimpleNamespace(name="getPresentationOutline", arguments=None)
        )
    )

    assert result["ok"] is True
    assert result["result"]["sections"] == [
        {"index": 1, "slide_number": 2, "title": "Agenda"}
    ]


def test_chat_tools_save_slide_accepts_object_content():
    memory = _FakeMemory()
    tools = ChatTools(memory)

    result = asyncio.run(
        tools.execute_tool_call(
            SimpleNamespace(
                name="saveSlide",
                arguments='{"layoutId":"layout-a","index":0,"replaceOldSlideAtIndex":true,"content":{"title":"Hello"}}',
            )
        )
    )

    assert result["ok"] is True
    assert memory.saved_payload == {
        "content": {"title": "Hello"},
        "layout_id": "layout-a",
        "index": 0,
        "replace_old_slide_at_index": True,
    }
