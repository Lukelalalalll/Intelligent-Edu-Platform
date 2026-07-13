"""Structured grading pipeline functions."""
import json
import logging
from typing import Any, Callable, Coroutine, Dict, Optional

from backend.prompts import prompt_registry
from backend.services.grading_normalizer import (
    _build_overall_score,
    _collect_low_confidence_questions,
    _extract_first_json_object,
    _fallback_question_pairs,
    _normalize_answer_key,
    _normalize_question_grades,
    _normalize_question_pairs,
)

logger = logging.getLogger(__name__)

# Type alias for the chat function passed in by the gateway class.
ChatFn = Callable[..., Coroutine[Any, Any, str]]


async def analyze_submission(
    chat_fn: ChatFn,
    *,
    text: str,
    rubric: Dict[str, Any],
    assignment: str,
    provider: str = "local_ollama",
) -> Dict[str, Any]:
    """Analyze submission via structured grading pipeline with fallback compatibility."""
    trimmed_text = (text or "")[:32000]
    rubric_json = json.dumps(rubric or {}, ensure_ascii=False)

    if not trimmed_text.strip():
        empty_report = {
            "mode": "structured_v1",
            "question_pairs": [],
            "answer_key": [],
            "question_grades": [],
            "overall_score": 0,
            "overall_feedback": "No readable submission text was extracted from the PDF.",
            "improvement_suggestions": ["Upload a text-readable PDF or enable OCR preprocessing."],
            "low_confidence_questions": [],
        }
        return {
            "raw_response": json.dumps(empty_report, ensure_ascii=False),
            "structured_report": empty_report,
            "pipeline_steps": {
                "extract_qa_pairs": {"status": "failed", "reason": "empty_submission_text", "raw_response": ""},
                "generate_answer_key": {"status": "skipped", "raw_response": ""},
                "grade_questions": {"status": "skipped", "raw_response": ""},
            },
        }

    extract_prompt = prompt_registry.render(
        "grading", "extract_qa_pairs",
        assignment=assignment,
        text=trimmed_text,
    )
    raw_extract = await chat_fn(message=extract_prompt, context=None, provider=provider)
    parsed_extract = _extract_first_json_object(raw_extract) or {}
    question_pairs = _normalize_question_pairs(parsed_extract)
    if not question_pairs:
        question_pairs = _fallback_question_pairs(trimmed_text)

    compact_pairs_json = json.dumps(question_pairs[:30], ensure_ascii=False)

    key_prompt = prompt_registry.render(
        "grading", "generate_answer_key",
        assignment=assignment,
        rubric_json=rubric_json,
        question_pairs_json=compact_pairs_json,
    )
    raw_key = await chat_fn(message=key_prompt, context=None, provider=provider)
    parsed_key = _extract_first_json_object(raw_key) or {}
    answer_key = _normalize_answer_key(parsed_key, question_pairs)

    answer_key_json = json.dumps(answer_key[:30], ensure_ascii=False)
    grading_prompt = prompt_registry.render(
        "grading", "grade_questions",
        rubric_json=rubric_json,
        question_pairs_json=compact_pairs_json,
        answer_key_json=answer_key_json,
    )
    raw_grade = await chat_fn(message=grading_prompt, context=None, provider=provider)
    parsed_grade = _extract_first_json_object(raw_grade) or {}

    question_grades = _normalize_question_grades(parsed_grade, question_pairs, answer_key)
    overall_score = _build_overall_score(question_grades)
    overall_feedback = str(parsed_grade.get("overall_feedback") or "").strip()
    suggestions = parsed_grade.get("improvement_suggestions")
    if not isinstance(suggestions, list):
        suggestions = []

    structured_report = {
        "mode": "structured_v1",
        "question_pairs": question_pairs,
        "answer_key": answer_key,
        "question_grades": question_grades,
        "overall_score": overall_score,
        "overall_feedback": overall_feedback,
        "improvement_suggestions": [str(item) for item in suggestions[:8]],
        "low_confidence_questions": _collect_low_confidence_questions(question_grades),
    }

    return {
        "raw_response": json.dumps(structured_report, ensure_ascii=False),
        "structured_report": structured_report,
        "pipeline_steps": {
            "extract_qa_pairs": {
                "status": "ok" if _normalize_question_pairs(parsed_extract) else "fallback",
                "raw_response": raw_extract,
                "parsed_count": len(question_pairs),
            },
            "generate_answer_key": {
                "status": "ok" if parsed_key else "fallback",
                "raw_response": raw_key,
                "parsed_count": len(answer_key),
            },
            "grade_questions": {
                "status": "ok" if parsed_grade else "fallback",
                "raw_response": raw_grade,
                "parsed_count": len(question_grades),
            },
        },
    }


async def regrade_single_question(
    chat_fn: ChatFn,
    *,
    rubric: Dict[str, Any],
    assignment: str,
    question_id: str,
    question_text: str,
    student_answer: str,
    reference_answer: str,
    key_points: list[str],
    max_score: float,
    provider: str = "local_ollama",
) -> Dict[str, Any]:
    rubric_json = json.dumps(rubric or {}, ensure_ascii=False)
    question_pairs = [
        {
            "question_id": question_id,
            "question_text": question_text,
            "student_answer": student_answer,
            "confidence": 0.8,
        }
    ]
    answer_key = [
        {
            "question_id": question_id,
            "reference_answer": reference_answer,
            "key_points": key_points or [],
            "max_score": max_score,
        }
    ]

    grading_prompt = prompt_registry.render(
        "grading", "grade_questions",
        rubric_json=rubric_json,
        question_pairs_json=json.dumps(question_pairs, ensure_ascii=False),
        answer_key_json=json.dumps(answer_key, ensure_ascii=False),
    )
    raw_grade = await chat_fn(message=grading_prompt, context=None, provider=provider)
    parsed_grade = _extract_first_json_object(raw_grade) or {}
    normalized_grades = _normalize_question_grades(parsed_grade, question_pairs, answer_key)
    grade = normalized_grades[0] if normalized_grades else {
        "question_id": question_id,
        "question_text": question_text,
        "student_answer": student_answer,
        "reference_answer": reference_answer,
        "key_points": key_points or [],
        "score": 0.0,
        "max_score": max_score,
        "rationale": "",
        "evidence": "",
        "confidence": 0.0,
    }
    return {
        "question_grade": grade,
        "raw_response": raw_grade,
    }


async def suggest_annotation(
    chat_fn: ChatFn,
    *,
    selected_text: str,
    rubric: Dict[str, Any],
    assignment: str,
) -> str:
    """Get AI suggestion for annotating a specific section."""
    prompt = prompt_registry.render(
        "grading", "suggest_annotation",
        selected_text=selected_text,
        assignment=assignment,
        rubric=rubric,
    )
    return await chat_fn(message=prompt, context=None, provider="local_ollama")
