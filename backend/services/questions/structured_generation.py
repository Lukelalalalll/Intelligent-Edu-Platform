"""Structured question generation helpers for sub2."""

from __future__ import annotations

import re
import uuid
from typing import Any


_QUESTION_START_RE = re.compile(
    r"(?m)^\s*(\d+)[\.\)]\s*(?:\*\*)?(?:Question\s*[:\uFF1A]\s*)?(.*?)(?:\*\*)?\s*$"
)
_OPTION_RE = re.compile(r"^\s*(?:[-*]\s+)?(?:\(?([A-H])\)?[\.\):])\s+(.*)$")
_ANSWER_RE = re.compile(r"^\s*Answer\s*[:\uFF1A]\s*(.*)$", re.IGNORECASE)
_EXPLANATION_RE = re.compile(r"^\s*Explanation\s*[:\uFF1A]\s*(.*)$", re.IGNORECASE)


def _clean_line(value: str) -> str:
    return re.sub(r"\s+$", "", str(value or "")).strip()


def _split_question_blocks(markdown: str) -> list[str]:
    text = str(markdown or "").strip()
    if not text:
        return []

    matches = list(_QUESTION_START_RE.finditer(text))
    if not matches:
        return [text]

    blocks: list[str] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        if block:
            blocks.append(block)
    return blocks


def _parse_question_block(block: str, index: int) -> dict[str, Any]:
    lines = [line.rstrip() for line in str(block or "").splitlines()]
    stem_parts: list[str] = []
    options: list[str] = []
    answer_parts: list[str] = []
    explanation_parts: list[str] = []
    active_section = "stem"

    for line_index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            if active_section == "stem" and stem_parts:
                stem_parts.append("")
            elif active_section == "answer" and answer_parts:
                answer_parts.append("")
            elif active_section == "explanation" and explanation_parts:
                explanation_parts.append("")
            continue

        if line_index == 0:
            match = _QUESTION_START_RE.match(line)
            if match:
                stem_text = _clean_line(match.group(2))
                if stem_text:
                    stem_parts.append(stem_text)
                active_section = "stem"
                continue

        option_match = _OPTION_RE.match(line)
        if option_match:
            label = option_match.group(1).upper()
            body = _clean_line(option_match.group(2))
            options.append(f"{label}. {body}" if body else f"{label}.")
            active_section = "options"
            continue

        answer_match = _ANSWER_RE.match(line)
        if answer_match:
            active_section = "answer"
            answer_text = _clean_line(answer_match.group(1))
            if answer_text:
                answer_parts.append(answer_text)
            continue

        explanation_match = _EXPLANATION_RE.match(line)
        if explanation_match:
            active_section = "explanation"
            explanation_text = _clean_line(explanation_match.group(1))
            if explanation_text:
                explanation_parts.append(explanation_text)
            continue

        if active_section == "options" and options:
            options[-1] = _clean_line(f"{options[-1]} {line}")
        elif active_section == "answer":
            answer_parts.append(line)
        elif active_section == "explanation":
            explanation_parts.append(line)
        else:
            stem_parts.append(line)

    stem = "\n".join(part for part in stem_parts).strip()
    answer = "\n".join(part for part in answer_parts).strip()
    explanation = "\n".join(part for part in explanation_parts).strip()

    return {
        "id": f"q_{index + 1}_{uuid.uuid4().hex[:8]}",
        "stem": stem or f"Question {index + 1}",
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "raw_markdown": block.strip(),
    }


def parse_question_markdown(markdown: str) -> list[dict[str, Any]]:
    return [
        _parse_question_block(block, index)
        for index, block in enumerate(_split_question_blocks(markdown))
        if str(block or "").strip()
    ]


def build_questions_markdown(questions: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, question in enumerate(questions, start=1):
        stem = _clean_line(question.get("stem", ""))
        options = [str(option or "").rstrip() for option in question.get("options", []) if str(option or "").strip()]
        answer = str(question.get("answer", "") or "").strip()
        explanation = str(question.get("explanation", "") or "").strip()

        parts = [f"{index}. Question: {stem or f'Question {index}'}"]
        parts.extend(options)
        if answer:
            parts.append(f"Answer: {answer}")
        if explanation:
            parts.append(f"Explanation: {explanation}")
        blocks.append("\n".join(parts).strip())
    return "\n\n".join(blocks).strip()


def build_questions_txt(questions: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for index, question in enumerate(questions, start=1):
        lines.append(f"{index}. {str(question.get('stem', '') or '').strip()}")
        for option in question.get("options", []) or []:
            option_text = str(option or "").strip()
            if option_text:
                lines.append(f"   {option_text}")
        answer = str(question.get("answer", "") or "").strip()
        explanation = str(question.get("explanation", "") or "").strip()
        if answer:
            lines.append(f"   Answer: {answer}")
        if explanation:
            lines.append(f"   Explanation: {explanation}")
        lines.append("")
    return "\n".join(lines).strip()


def normalize_question_drafts(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(questions or []):
        options = [str(option or "").strip() for option in item.get("options", []) if str(option or "").strip()]
        normalized_item = {
            "id": str(item.get("id") or f"q_{index + 1}_{uuid.uuid4().hex[:8]}"),
            "stem": str(item.get("stem", "") or "").strip(),
            "options": options,
            "answer": str(item.get("answer", "") or "").strip(),
            "explanation": str(item.get("explanation", "") or "").strip(),
            "raw_markdown": str(item.get("raw_markdown", "") or "").strip(),
        }
        if not normalized_item["raw_markdown"]:
            normalized_item["raw_markdown"] = build_questions_markdown([normalized_item])
        normalized.append(normalized_item)
    return normalized
