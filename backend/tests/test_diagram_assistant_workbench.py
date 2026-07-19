from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.routes.diagram_routes.assistant import (
    _extract_replacement_from_text,
    _fallback_tool_calls,
    _normalize_tool_calls,
    _sanitize_svg,
)
from backend.services.ai_gateway_service import AIGatewayService


def test_normalize_tool_calls_filters_invalid_entries():
    calls = _normalize_tool_calls(
        [
            {
                "id": "call_1",
                "function": {
                    "name": "diagram_generate_svg",
                    "arguments": "{\"prompt\":\"cell respiration\"}",
                },
            },
            {
                "id": "call_2",
                "function": {
                    "name": "not_allowed",
                    "arguments": "{}",
                },
            },
            {
                "name": "diagram_edit_svg_text",
                "arguments": {"source_text": "Photosynthesis", "target_text": "光合作用"},
            },
        ]
    )

    assert [item["name"] for item in calls] == ["diagram_generate_svg", "diagram_edit_svg_text"]
    assert calls[0]["arguments"] == {"prompt": "cell respiration"}
    assert calls[1]["arguments"] == {"source_text": "Photosynthesis", "target_text": "光合作用"}


def test_extract_replacement_from_text_handles_chinese_phrase():
    replacement = _extract_replacement_from_text("把当前 SVG 里的 Photosynthesis 改成 光合作用")

    assert replacement == ("Photosynthesis", "光合作用")


def test_sanitize_svg_removes_active_content():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'onload="alert(1)"><script>alert(1)</script>'
        '<text style="color:red">Hello</text></svg>'
    )

    sanitized = _sanitize_svg(svg)

    assert "<script" not in sanitized.lower()
    assert "onload" not in sanitized.lower()
    assert "Hello" in sanitized


def test_fallback_tool_calls_prefers_svg_edit_when_current_svg_exists():
    calls = _fallback_tool_calls(
        user_text="把当前 SVG 里的 Photosynthesis 改成 光合作用",
        active_service="search",
        workspace_state={"current_svg": "<svg />"},
    )

    assert calls[0]["name"] == "diagram_edit_svg_text"


@pytest.mark.asyncio
async def test_chat_with_tools_runtime_uses_bigmodel_wrapper(monkeypatch):
    captured = {}

    class FakeOpenAIService:
        def __init__(self, **kwargs):
            captured["kwargs"] = kwargs

        async def chat_with_tools(self, message, tools=None, context=None, raw_messages=None):
            captured["message"] = message
            captured["tools"] = tools
            captured["context"] = context
            captured["raw_messages"] = raw_messages
            return {"content": "planner", "tool_calls": [{"name": "diagram_generate_svg", "arguments": {}}]}

    monkeypatch.setattr("backend.services.ai_gateway_service.OpenAIService", FakeOpenAIService)

    runtime = SimpleNamespace(
        provider_id="bigmodel",
        api_key="bigmodel-key",
        base_url="https://open.bigmodel.cn/api/paas/v4",
        model="glm-4.5-flash",
    )
    service = AIGatewayService()

    result = await service.chat_with_tools_runtime(
        runtime=runtime,
        messages=[{"role": "user", "content": "帮我生成一个流程图"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "diagram_generate_svg",
                    "description": "Generate SVG.",
                    "parameters": {"type": "object"},
                },
            }
        ],
        context={"active_service": "generate"},
    )

    assert captured["kwargs"]["provider_id"] == "bigmodel"
    assert captured["kwargs"]["credential_alias"] == "BIGMODEL_API_KEY"
    assert captured["tools"][0]["function"]["name"] == "diagram_generate_svg"
    assert result["tool_calls"][0]["name"] == "diagram_generate_svg"
