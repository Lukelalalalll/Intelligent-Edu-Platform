from __future__ import annotations

import asyncio
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

from llmai.shared import ToolResponseMessage  # type: ignore[import-not-found]

_PRESENTON_RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "presenton_runtime"
if str(_PRESENTON_RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(_PRESENTON_RUNTIME_ROOT))

from services.chat.service import PresentationChatService


class _FakeConversationStore:
    instances: list["_FakeConversationStore"] = []

    def __init__(self, _session):
        self.generated_conversation_id = uuid.uuid4()
        self.history = [
            {"role": "user", "content": "UI context: sidebar\nUser message: Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
        ]
        self.append_calls: list[dict[str, object]] = []
        _FakeConversationStore.instances.append(self)

    async def ensure_conversation_id(self, conversation_id):
        return conversation_id or self.generated_conversation_id

    async def load_history(self, **_kwargs):
        return list(self.history)

    async def retrieve_semantic_context(self, **_kwargs):
        return "chat semantic context"

    async def append_turn(self, **kwargs):
        self.append_calls.append(kwargs)


class _FakeMemory:
    instances: list["_FakeMemory"] = []

    def __init__(self, _session, presentation_id):
        self.presentation_id = presentation_id
        _FakeMemory.instances.append(self)

    async def retrieve_context(self, query: str):
        return f"presentation memory for {query}"


class _FakeTools:
    instances: list["_FakeTools"] = []

    def __init__(self, _memory):
        self.calls = []
        _FakeTools.instances.append(self)

    def get_tool_definitions(self):
        return [{"name": "saveSlide"}]

    async def execute_tool_call(self, tool_call):
        self.calls.append(tool_call)
        return {
            "ok": True,
            "tool": tool_call.name,
            "result": {
                "message": "Saved slide successfully.",
                "resolved_index": 1,
            },
        }


class _FakeSqlSession:
    def __init__(self, presentation_id: uuid.UUID):
        self.presentation_id = presentation_id
        self.commit_calls = 0

    async def get(self, model, identifier):
        if model.__name__ == "PresentationModel" and identifier == self.presentation_id:
            return object()
        return None

    async def commit(self):
        self.commit_calls += 1


class _FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[dict[str, object]] = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def _patch_service_dependencies(monkeypatch):
    _FakeConversationStore.instances.clear()
    _FakeMemory.instances.clear()
    _FakeTools.instances.clear()
    monkeypatch.setattr("services.chat.service.ChatConversationStore", _FakeConversationStore)
    monkeypatch.setattr("services.chat.service.PresentationContextStore", _FakeMemory)
    monkeypatch.setattr("services.chat.service.ChatTools", _FakeTools)


def _patch_llm_runtime(monkeypatch, *, client, stream_impl=None):
    monkeypatch.setattr("services.chat.service_support.llm_orchestration.get_client", lambda config: client)
    monkeypatch.setattr("services.chat.service_support.llm_orchestration.get_llm_config", lambda: {})
    monkeypatch.setattr("services.chat.service_support.llm_orchestration.get_model", lambda: "fake-model")
    monkeypatch.setattr(
        "services.chat.service_support.llm_orchestration.build_chat_llm_tools",
        lambda definitions: definitions,
    )
    monkeypatch.setattr(
        "services.chat.service_support.llm_orchestration.get_generate_kwargs",
        lambda **kwargs: kwargs,
    )
    monkeypatch.setattr(
        "services.chat.service_support.llm_orchestration.extract_text",
        lambda content: content if isinstance(content, str) else "",
    )
    monkeypatch.setattr(
        "services.chat.service_support.llm_orchestration.handle_llm_client_exceptions",
        lambda exc: exc,
    )
    if stream_impl is not None:
        monkeypatch.setattr(
            "services.chat.service_support.llm_orchestration.stream_generate_events",
            stream_impl,
        )


def test_generate_reply_persists_turn_and_strips_ui_context(monkeypatch):
    _patch_service_dependencies(monkeypatch)

    tool_call = types.SimpleNamespace(
        name="saveSlide",
        arguments='{"index": 1}',
        id="tool-1",
    )
    client = _FakeClient(
        responses=[
            types.SimpleNamespace(tool_calls=[tool_call], messages=["round-1"], content=""),
            types.SimpleNamespace(tool_calls=[], messages=None, content="All set."),
        ]
    )
    _patch_llm_runtime(monkeypatch, client=client)

    presentation_id = uuid.uuid4()
    service = PresentationChatService(
        sql_session=_FakeSqlSession(presentation_id),
        presentation_id=presentation_id,
        conversation_id=None,
    )

    result = asyncio.run(
        service.generate_reply("UI context: right panel\nUser message: Save the slide")
    )

    assert result.response_text == "All set."
    assert result.tool_calls == ["saveSlide"]
    append_call = _FakeConversationStore.instances[-1].append_calls[-1]
    assert append_call["user_message"] == "Save the slide"
    second_round_messages = client.calls[-1]["messages"]
    assert any(isinstance(message, ToolResponseMessage) for message in second_round_messages)


def test_stream_reply_emits_trace_events_and_complete_payload(monkeypatch):
    _patch_service_dependencies(monkeypatch)

    tool_call = types.SimpleNamespace(
        name="saveSlide",
        arguments='{"index": 1}',
        id="tool-2",
    )
    stream_calls: list[dict[str, object]] = []

    async def fake_stream_generate_events(_client, **kwargs):
        stream_calls.append(kwargs)
        if len(stream_calls) == 1:
            yield types.SimpleNamespace(type="thinking", text="Need a tool first")
            yield types.SimpleNamespace(
                type="completion",
                tool_calls=[tool_call],
                messages=["round-1"],
                content="",
            )
            return
        yield types.SimpleNamespace(type="content", chunk="Done.")
        yield types.SimpleNamespace(
            type="completion",
            tool_calls=[],
            messages=["round-2"],
            content="Done.",
        )

    _patch_llm_runtime(monkeypatch, client=types.SimpleNamespace(), stream_impl=fake_stream_generate_events)

    presentation_id = uuid.uuid4()
    service = PresentationChatService(
        sql_session=_FakeSqlSession(presentation_id),
        presentation_id=presentation_id,
        conversation_id=None,
    )

    async def collect_events():
        items = []
        async for event in service.stream_reply(
            "UI context: right panel\nUser message: Update slide two"
        ):
            items.append(event)
        return items

    events = asyncio.run(collect_events())

    assert events[0] == ("status", "Reading deck context")
    trace_payloads = [value for event_type, value in events if event_type == "trace"]
    assert [payload["kind"] for payload in trace_payloads] == [
        "model_note",
        "tool_plan",
        "tool_call",
        "tool_call",
    ]
    assert ("chunk", "Done.") in events
    assert events[-2] == ("status", "Saving chat")
    assert events[-1][0] == "complete"
    assert events[-1][1].response_text == "Done."
    assert events[-1][1].tool_calls == ["saveSlide"]
    assert any(
        isinstance(message, ToolResponseMessage)
        for message in stream_calls[-1]["messages"]
    )


def test_generate_reply_uses_tool_limit_fallback_when_no_final_answer(monkeypatch):
    _patch_service_dependencies(monkeypatch)

    tool_call = types.SimpleNamespace(
        name="saveSlide",
        arguments='{"index": 0}',
        id="tool-3",
    )
    client = _FakeClient(
        responses=[
            types.SimpleNamespace(tool_calls=[tool_call], messages=["round-1"], content=""),
        ]
    )
    _patch_llm_runtime(monkeypatch, client=client)
    monkeypatch.setattr("services.chat.service_support.llm_orchestration.MAX_TOOL_ROUNDS", 1)
    monkeypatch.setattr(
        "services.chat.service_support.llm_orchestration.ChatLlmOrchestrator._try_final_response_without_tools",
        AsyncMock(return_value=None),
    )

    presentation_id = uuid.uuid4()
    service = PresentationChatService(
        sql_session=_FakeSqlSession(presentation_id),
        presentation_id=presentation_id,
        conversation_id=None,
    )

    result = asyncio.run(service.generate_reply("Please keep going"))

    assert result.response_text == "Saved slide successfully."
    assert result.tool_calls == ["saveSlide"]
