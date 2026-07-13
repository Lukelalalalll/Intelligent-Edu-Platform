from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.routes.questions_routes import history as question_history_routes
from backend.routes.questions_routes import tools as question_tools_routes
from backend.schemas.questions import QuestionDraftSchema, QuestionExportSelectionSchema, QuestionHistoryFinalizeSchema
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
