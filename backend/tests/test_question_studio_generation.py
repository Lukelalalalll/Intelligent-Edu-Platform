from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.core.ai_provider import ProviderStatus
from backend.routes.questions_routes import generate as question_generate_routes
from backend.routes.questions_routes import history as question_history_routes
from backend.routes.questions_routes import tools as question_tools_routes
from backend.schemas.questions import (
    GenerateQuestionsSchema,
    QuestionDraftSchema,
    QuestionExportSelectionSchema,
    QuestionHistoryFinalizeSchema,
)
from backend.services.questions import generation as question_generation_service
from backend.services.questions.structured_generation import (
    build_questions_markdown,
    build_questions_txt,
    parse_question_markdown,
)


def test_parse_question_markdown_returns_structured_questions():
    markdown = """
1. Question: Solve $x + 2 = 5$.
A. $x=1$
B. $x=2$
C. $x=3$
Answer: C
Explanation: Because $x=3$ satisfies the equation.

2. Question: Define inertia.
Answer: Resistance to change in motion.
Explanation: It is a property of matter.
""".strip()

    questions = parse_question_markdown(markdown)

    assert len(questions) == 2
    assert questions[0]["stem"] == "Solve $x + 2 = 5$."
    assert questions[0]["options"] == ["A. $x=1$", "B. $x=2$", "C. $x=3$"]
    assert questions[0]["answer"] == "C"
    assert "equation" in questions[0]["explanation"]
    assert questions[1]["options"] == []


def test_question_text_builders_emit_expected_formats():
    questions = [
        {
            "id": "q1",
            "stem": "Compute $2+2$.",
            "options": ["A. 3", "B. 4"],
            "answer": "B",
            "explanation": "$2+2=4$.",
            "raw_markdown": "",
        }
    ]

    markdown = build_questions_markdown(questions)
    txt = build_questions_txt(questions)

    assert "1. Question: Compute $2+2$." in markdown
    assert "Answer: B" in markdown
    assert "1. Compute $2+2$." in txt
    assert "Explanation: $2+2=4$." in txt


def test_export_selection_route_returns_markdown_blob():
    response = question_tools_routes.export_selection_route(
        QuestionExportSelectionSchema(
            questions=[
                QuestionDraftSchema(
                    id="q1",
                    stem="Compute $2+2$.",
                    options=["A. 3", "B. 4"],
                    answer="B",
                    explanation="$2+2=4$.",
                    raw_markdown="",
                )
            ],
            format="markdown",
            filename="algebra-set",
        ),
        user={"id": "teacher-1"},
    )

    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == 'attachment; filename="algebra-set.md"'
    assert "Compute $2+2$." in response.body.decode("utf-8")


@pytest.mark.asyncio
async def test_list_question_providers_returns_public_statuses(monkeypatch):
    monkeypatch.setattr(
        question_tools_routes,
        "list_provider_statuses",
        AsyncMock(return_value=[
            ProviderStatus(
                id="auto",
                label="Auto",
                available=True,
                configured=True,
                source="auto",
                model="gpt-5.5",
                message="Will use openai (gpt-5.5)",
                is_recommended=True,
            ),
            ProviderStatus(
                id="openai",
                label="OpenAI",
                available=True,
                configured=True,
                source="user_ai_config",
                model="gpt-5.5",
                message="ok",
                is_recommended=False,
            ),
        ]),
    )

    result = await question_tools_routes.list_question_providers(user={"id": "teacher-1"})

    assert result["providers"][0]["id"] == "auto"
    assert result["providers"][0]["model"] == "gpt-5.5"
    assert result["providers"][1]["source"] == "user_ai_config"


@pytest.mark.asyncio
async def test_call_provider_generate_uses_runtime_without_fallback(monkeypatch):
    fake_service = SimpleNamespace(
        chat_with_runtime=AsyncMock(return_value="ok"),
        chat_with_provider=AsyncMock(return_value="should-not-be-used"),
    )
    monkeypatch.setattr(question_generation_service, "get_ai_gateway_service", lambda: fake_service)

    result = await question_generation_service.call_provider_generate(
        base_content="Source text",
        user_requirements="Keep it short",
        question_type="Short answer",
        output_language="English",
        runtime=SimpleNamespace(provider_id="openai", model="gpt-5.5"),
    )

    assert result == "ok"
    fake_service.chat_with_runtime.assert_awaited_once()
    assert fake_service.chat_with_runtime.await_args.kwargs["allow_fallback"] is False
    fake_service.chat_with_provider.assert_not_called()


@pytest.mark.asyncio
async def test_generate_question_bundle_supports_prompt_only_and_records_runtime_metadata(monkeypatch, tmp_path):
    class DummyTimer:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.save = AsyncMock()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    runtime = SimpleNamespace(
        provider_id="openai",
        requested_provider="auto",
        config_source="user_ai_config",
        model="gpt-5.5",
    )
    monkeypatch.setattr(question_generate_routes, "resolve_provider_runtime", AsyncMock(return_value=runtime))
    monkeypatch.setattr(question_generate_routes, "TelemetryTimer", DummyTimer)
    monkeypatch.setattr(question_generate_routes, "call_provider_generate", AsyncMock(return_value=(
        "1. Question: Explain inertia.\n"
        "Answer: Resistance to change in motion.\n"
        "Explanation: Matter resists changes to its state of motion."
    )))
    monkeypatch.setattr(question_generate_routes, "save_history_record", AsyncMock(return_value="hist-1"))
    monkeypatch.setattr(question_generate_routes, "compute_history_expires_at", AsyncMock(return_value=None))
    monkeypatch.setattr(question_generate_routes.Config, "GENERATED_FOLDER_SUB2", str(tmp_path))

    request = SimpleNamespace(session={})
    req = GenerateQuestionsSchema(
        provider="auto",
        source_text="Explain inertia in plain language.",
        question_type="Short answer",
        num_questions=1,
        difficulty=3,
        constraints=[],
        output_language="English",
        source_type="pdf",
        page_numbers=[],
    )

    payload = await question_generate_routes._generate_question_bundle(
        req=req,
        request=request,
        user={"id": "teacher-1"},
        endpoint_label="sub2/generate",
    )

    assert payload["success"] is True
    assert payload["provider"] == "openai"
    assert payload["provider_source"] == "user_ai_config"
    assert payload["effective_model"] == "gpt-5.5"
    assert payload["source_kind"] == "text"
    assert payload["task_id"] in request.session["sub2_tasks"]

    generate_kwargs = question_generate_routes.call_provider_generate.await_args.kwargs
    assert generate_kwargs["runtime"] is runtime

    history_kwargs = question_generate_routes.save_history_record.await_args.kwargs
    assert history_kwargs["params"]["provider_requested"] == "auto"
    assert history_kwargs["params"]["provider_resolved"] == "openai"
    assert history_kwargs["params"]["provider_source"] == "user_ai_config"
    assert history_kwargs["params"]["effective_model"] == "gpt-5.5"
    assert history_kwargs["params"]["page_numbers"] == []
    assert history_kwargs["source"]["effective_model"] == "gpt-5.5"


@pytest.mark.asyncio
async def test_generate_questions_route_preserves_provider_http_status(monkeypatch):
    monkeypatch.setattr(
        question_generate_routes,
        "_generate_question_bundle",
        AsyncMock(side_effect=HTTPException(status_code=503, detail="Provider openai unavailable")),
    )

    response = await question_generate_routes.generate_questions_route(
        req=GenerateQuestionsSchema(
            provider="openai",
            source_text="Explain inertia.",
            question_type="Short answer",
            num_questions=1,
            difficulty=3,
            constraints=[],
            output_language="English",
            source_type="pdf",
            page_numbers=[],
        ),
        request=SimpleNamespace(session={}),
        user={"id": "teacher-1"},
    )

    body = json.loads(response.body.decode("utf-8"))
    assert response.status_code == 503
    assert body["error"] == "Provider openai unavailable"


@pytest.mark.asyncio
async def test_replay_generation_history_returns_page_scope_and_model(monkeypatch, tmp_path):
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    source_file = upload_root / "notes.pdf"
    source_file.write_bytes(b"%PDF-1.4")
    monkeypatch.setattr(question_history_routes.Config, "UPLOAD_FOLDER_SUB2", str(upload_root))
    monkeypatch.setattr(
        question_history_routes,
        "get_history_document",
        AsyncMock(return_value={
            "source": {
                "file_path": str(source_file),
                "file_name": "notes.pdf",
                "file_type": "pdf",
                "total_pages": 8,
                "provider_resolved": "openai",
                "provider_source": "user_ai_config",
                "effective_model": "gpt-5.5",
            },
            "params": {
                "page_numbers": [0, 1, 2],
                "source_type": "pdf",
                "provider_requested": "auto",
                "provider_resolved": "openai",
                "provider_source": "user_ai_config",
                "effective_model": "gpt-5.5",
            },
        }),
    )

    request = SimpleNamespace(session={})
    result = await question_history_routes.replay_generation_history(
        history_id="history-1",
        request=request,
        user={"id": "teacher-1"},
    )

    assert result["page_numbers"] == [0, 1, 2]
    assert result["provider_resolved"] == "openai"
    assert result["provider_source"] == "user_ai_config"
    assert result["effective_model"] == "gpt-5.5"
    assert result["task_id"] in request.session["sub2_tasks"]


@pytest.mark.asyncio
async def test_finalize_generation_history_updates_finalized_payload(monkeypatch):
    get_history_document = AsyncMock(return_value={"params": {"question_type": "Multiple choice"}})
    update_history_record = AsyncMock(return_value=1)
    monkeypatch.setattr(question_history_routes, "get_history_document", get_history_document)
    monkeypatch.setattr(question_history_routes, "update_history_record", update_history_record)

    payload = QuestionHistoryFinalizeSchema(
        questions=[
            QuestionDraftSchema(
                id="q1",
                stem="What is $1+1$?",
                options=["A. 1", "B. 2"],
                answer="B",
                explanation="$1+1=2$",
                raw_markdown="",
            )
        ],
        markdown="",
        selected_question_ids=["q1"],
    )

    result = await question_history_routes.finalize_generation_history(
        history_id="507f1f77bcf86cd799439011",
        payload=payload,
        user={"id": "teacher-1"},
    )

    assert result == {"success": True, "history_id": "507f1f77bcf86cd799439011"}
    update_kwargs = update_history_record.await_args.kwargs
    assert update_kwargs["params"]["finalized"] is True
    assert update_kwargs["result_full"]["selected_question_ids"] == ["q1"]
