"""Pure normalizer helpers for the structured grading pipeline.

These functions are stateless and have no I/O — they only transform
data returned by LLM responses into well-typed dicts that the grading
pipeline can consume.  Kept separate from AIGatewayService so they can
be unit-tested without any network or database setup.
"""
import json
from typing import Any


def _extract_first_json_object(text: str) -> dict[str, Any] | None:
    payload = str(text or "").strip()
    if not payload:
        return None

    without_fence = payload.replace("```json", "").replace("```", "").strip()
    try:
        decoded = json.loads(without_fence)
        return decoded if isinstance(decoded, dict) else None
    except json.JSONDecodeError:
        pass

    start = without_fence.find("{")
    end = without_fence.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        decoded = json.loads(without_fence[start:end + 1])
        return decoded if isinstance(decoded, dict) else None
    except json.JSONDecodeError:
        return None


def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_question_pairs(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    rows = parsed.get("question_pairs") if isinstance(parsed, dict) else []
    if not isinstance(rows, list):
        return []

    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(rows, start=1):
        if not isinstance(item, dict):
            continue
        qid = str(item.get("question_id") or f"Q{idx}").strip() or f"Q{idx}"
        qtext = str(item.get("question_text") or "").strip()
        answer = str(item.get("student_answer") or "").strip()
        if not answer:
            continue
        normalized.append(
            {
                "question_id": qid,
                "question_text": qtext,
                "student_answer": answer[:1500],
                "confidence": _safe_number(item.get("confidence"), 0.6),
            }
        )
    return normalized


def _fallback_question_pairs(text: str) -> list[dict[str, Any]]:
    content = str(text or "").strip()
    if not content:
        return []
    return [
        {
            "question_id": "Q1",
            "question_text": "Submission (auto fallback)",
            "student_answer": content[:3000],
            "confidence": 0.2,
        }
    ]


def _normalize_answer_key(
    parsed: dict[str, Any],
    question_pairs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = parsed.get("answer_key") if isinstance(parsed, dict) else []
    by_qid: dict[str, dict[str, Any]] = {}
    if isinstance(rows, list):
        for item in rows:
            if not isinstance(item, dict):
                continue
            qid = str(item.get("question_id") or "").strip()
            if not qid:
                continue
            key_points = item.get("key_points")
            by_qid[qid] = {
                "question_id": qid,
                "reference_answer": str(item.get("reference_answer") or "").strip(),
                "key_points": [str(x) for x in key_points] if isinstance(key_points, list) else [],
                "max_score": max(0.0, _safe_number(item.get("max_score"), 0.0)),
            }

    total_questions = max(1, len(question_pairs))
    fallback_max = round(100.0 / total_questions, 2)
    normalized: list[dict[str, Any]] = []
    for qp in question_pairs:
        qid = str(qp.get("question_id") or "").strip()
        item = by_qid.get(qid, {})
        normalized.append(
            {
                "question_id": qid,
                "reference_answer": str(item.get("reference_answer") or "").strip(),
                "key_points": item.get("key_points") or [],
                "max_score": _safe_number(item.get("max_score"), fallback_max),
            }
        )
    return normalized


def _normalize_question_grades(
    parsed: dict[str, Any],
    question_pairs: list[dict[str, Any]],
    answer_key: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = parsed.get("question_grades") if isinstance(parsed, dict) else []
    if not isinstance(rows, list):
        rows = []

    key_by_qid = {str(k.get("question_id") or ""): k for k in answer_key}
    normalized: list[dict[str, Any]] = []

    for qp in question_pairs:
        qid = str(qp.get("question_id") or "").strip()
        grade_item = next(
            (x for x in rows if isinstance(x, dict) and str(x.get("question_id") or "").strip() == qid),
            {},
        )
        key_item = key_by_qid.get(qid, {})
        max_score = max(
            0.0,
            _safe_number(grade_item.get("max_score"), _safe_number(key_item.get("max_score"), 0.0)),
        )
        score = max(
            0.0,
            min(max_score if max_score > 0 else 100.0, _safe_number(grade_item.get("score"), 0.0)),
        )

        normalized.append(
            {
                "question_id": qid,
                "question_text": str(qp.get("question_text") or "").strip(),
                "student_answer": str(qp.get("student_answer") or "").strip(),
                "reference_answer": str(key_item.get("reference_answer") or "").strip(),
                "key_points": key_item.get("key_points") or [],
                "score": score,
                "max_score": max_score,
                "rationale": str(grade_item.get("rationale") or "").strip(),
                "evidence": str(grade_item.get("evidence") or "").strip(),
                "confidence": _safe_number(grade_item.get("confidence"), 0.5),
            }
        )

    return normalized


def _build_overall_score(question_grades: list[dict[str, Any]]) -> float:
    if not question_grades:
        return 0.0
    total = sum(_safe_number(item.get("score"), 0.0) for item in question_grades)
    max_total = sum(_safe_number(item.get("max_score"), 0.0) for item in question_grades)
    if max_total <= 0:
        return 0.0
    return round((total / max_total) * 100.0, 2)


def _collect_low_confidence_questions(
    question_grades: list[dict[str, Any]],
    threshold: float = 0.55,
) -> list[dict[str, Any]]:
    flagged: list[dict[str, Any]] = []
    for item in question_grades:
        confidence = _safe_number(item.get("confidence"), 0.0)
        rationale = str(item.get("rationale") or "").strip()
        evidence = str(item.get("evidence") or "").strip()

        reason = ""
        if confidence < threshold:
            reason = f"low_confidence<{threshold}"
        elif not rationale:
            reason = "missing_rationale"
        elif not evidence:
            reason = "missing_evidence"

        if reason:
            flagged.append(
                {
                    "question_id": str(item.get("question_id") or "").strip(),
                    "confidence": confidence,
                    "reason": reason,
                }
            )
    return flagged
