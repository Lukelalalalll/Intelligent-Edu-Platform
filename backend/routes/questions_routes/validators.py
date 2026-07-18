"""Pure validation, parsing, normalization, and scoring utilities for question generation."""
from __future__ import annotations

import re
from typing import Any

from backend.services.ai_gateway_service import get_ai_gateway_service


# ── Text normalization ──

def _normalize_question_line(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^\s*\d+[\.)]\s*", "", str(text or "").strip())).lower()


def _parse_question_candidates(source_text: str) -> list[str]:
    lines = [ln.strip() for ln in str(source_text or "").splitlines() if ln.strip()]
    candidates: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.)]\s+", line) or line.endswith("?"):
            candidates.append(line)
    if not candidates:
        for chunk in re.split(r"\n\s*\n", str(source_text or "")):
            sentence = chunk.strip()
            if sentence:
                candidates.append(sentence[:220])
    return candidates[:120]


# ── Question counting & block splitting ──

def _estimate_generated_question_count(text: str) -> int:
    content = str(text or "")
    if not content.strip():
        return 0

    patterns = [
        r"(?m)^\s*(?:\*\*)?\s*\d+[\.|\)|、]\s+",
        r"(?m)^\s*(?:Q(?:uestion)?\s*)\d+[\.:)]\s*",
        r"(?m)^\s*(?:第\s*\d+\s*题)",
    ]

    max_hits = 0
    for pattern in patterns:
        try:
            hits = len(re.findall(pattern, content, flags=re.IGNORECASE))
            max_hits = max(max_hits, hits)
        except re.error:
            continue
    return max_hits


def _split_numbered_question_blocks(text: str) -> list[str]:
    content = str(text or "")
    if not content.strip():
        return []

    pattern = re.compile(r"(?m)^\s*(?:\*\*)?\s*\d+[\.|\)|、]\s+")
    starts = [m.start() for m in pattern.finditer(content)]
    if not starts:
        return [content.strip()]

    blocks: list[str] = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(content)
        chunk = content[start:end].strip()
        if chunk:
            blocks.append(chunk)
    return blocks


# ── Question type helpers ──

def _question_type_key(question_type: str) -> str:
    return str(question_type or "").strip().lower().replace("_", " ").replace("-", " ")


def _build_question_type_format_hint(question_type: str) -> str:
    qtype = _question_type_key(question_type)
    if "multiple" in qtype and "choice" in qtype:
        return (
            " Strict format for multiple-choice questions: "
            "for each question, include exactly four options labeled A., B., C., D.; "
            "the Answer line must reference one option label (e.g., A or B); "
            "and include a short Explanation section. "
            "Do not omit options under any circumstance."
        )
    if "fill" in qtype and "blank" in qtype:
        return (
            " Strict format for fill-in-the-blank questions: "
            "each question stem must contain at least one blank marker (e.g., ____ or ( )); "
            "and must include explicit Answer and Explanation lines."
        )
    if "calculation" in qtype:
        return (
            " Strict format for calculation questions: "
            "each question must include numeric/problem data, an explicit final Answer line, "
            "and a Step-by-step Explanation (or Solution) section."
        )
    if "proof" in qtype:
        return (
            " Strict format for proof questions: "
            "each question must include an explicit Answer line and a structured proof/explanation section "
            "(e.g., Proof / 证明 / Reasoning Steps)."
        )
    if "short answer" in qtype:
        return (
            " Strict format for short-answer questions: "
            "each question must include an explicit model Answer line and a concise Explanation section."
        )
    if "quiz" in qtype or "exam paper" in qtype:
        return (
            " Strict format for quiz/exam output: "
            "every question item must include explicit Answer and Explanation lines; "
            "do not output question-only items."
        )
    return ""


# ── Output validation ──

def _validate_multiple_choice_output(text: str, expected_count: int) -> tuple[bool, str]:
    blocks = _split_numbered_question_blocks(text)
    if len(blocks) < expected_count:
        return False, f"only found {len(blocks)} numbered blocks, expected {expected_count}"

    checked = blocks[:expected_count]
    issues: list[str] = []

    for i, block in enumerate(checked, start=1):
        has_abcd = all(
            re.search(rf"(?im)^\s*{label}[\.|\)|:|：|、]\s+", block)
            for label in ["A", "B", "C", "D"]
        )
        has_1234 = all(
            re.search(rf"(?im)^\s*{label}[\.|\)|:|：|、]\s+", block)
            for label in ["1", "2", "3", "4"]
        )
        has_answer = bool(re.search(r"(?im)^\s*(answer|ans|答案)\s*[:：]", block))

        if not (has_abcd or has_1234):
            issues.append(f"Q{i} missing options")
        if not has_answer:
            issues.append(f"Q{i} missing answer")

    if issues:
        return False, "; ".join(issues[:8])
    return True, ""


def _validate_non_mcq_output(text: str, expected_count: int, question_type: str) -> tuple[bool, str]:
    qtype = _question_type_key(question_type)
    blocks = _split_numbered_question_blocks(text)
    if len(blocks) < expected_count:
        return False, f"only found {len(blocks)} numbered blocks, expected {expected_count}"

    checked = blocks[:expected_count]
    issues: list[str] = []

    for i, block in enumerate(checked, start=1):
        has_answer = bool(re.search(r"(?im)^\s*(answer|ans|答案)\s*[:：]", block))
        has_explanation = bool(re.search(r"(?im)^\s*(explanation|解析|solution|解答|proof|证明|reasoning)\s*[:：]", block))

        if not has_answer:
            issues.append(f"Q{i} missing answer")

        if any(k in qtype for k in ["fill", "blank", "calculation", "proof", "short answer", "quiz", "exam paper"]):
            if not has_explanation:
                issues.append(f"Q{i} missing explanation")

        if "fill" in qtype and "blank" in qtype:
            has_blank = bool(re.search(r"_{3,}|\(\s*\)|（\s*）|\[\s*\]", block))
            if not has_blank:
                issues.append(f"Q{i} missing blank marker")

    if issues:
        return False, "; ".join(issues[:8])
    return True, ""


def _validate_output_by_type(text: str, expected_count: int, question_type: str) -> tuple[bool, str]:
    qtype = _question_type_key(question_type)
    if "multiple" in qtype and "choice" in qtype:
        return _validate_multiple_choice_output(text, expected_count)
    return _validate_non_mcq_output(text, expected_count, question_type)


# ── Answer extraction & fill-in-blank normalization ──

def _extract_answer_text(block: str) -> str:
    m = re.search(r"(?is)(?:^|\n)\s*(?:answer|ans|答案)\s*[:：]\s*(.+?)(?:\n|$)", block)
    if not m:
        return ""
    answer = m.group(1).strip()
    answer = re.split(r"(?i)\b(?:explanation|解析|solution|解答|proof|证明|reasoning)\s*[:：]", answer)[0].strip()
    return answer


def _normalize_fill_in_blank_output(text: str) -> str:
    blocks = _split_numbered_question_blocks(text)
    if not blocks:
        return text

    normalized_blocks: list[str] = []
    for block in blocks:
        answer = _extract_answer_text(block)

        answer_marker = re.search(r"(?is)(?:^|\n)\s*(?:answer|ans|答案)\s*[:：]", block)
        stem_part = block
        tail_part = ""
        if answer_marker:
            stem_part = block[:answer_marker.start()].strip()
            tail_part = block[answer_marker.start():].strip()

        # Normalize alternate blank markers to a single canonical token.
        stem_part = re.sub(r"\(\s*\)|（\s*）|\[\s*\]", "____", stem_part)

        replaced = 0
        if answer:
            answer_tokens = [re.escape(tok) for tok in re.split(r"\s+", answer) if tok]
            if answer_tokens:
                token_join = r"\s+".join(answer_tokens)
                answer_pattern = rf"(?i)(?<!\w){token_join}(?!\w)"
                stem_part, replaced = re.subn(answer_pattern, "____", stem_part, count=1)

            if replaced == 0:
                lower_stem = stem_part.lower()
                lower_answer = answer.lower()
                idx = lower_stem.find(lower_answer)
                if idx >= 0:
                    stem_part = stem_part[:idx] + "____" + stem_part[idx + len(answer):]
                    replaced = 1

        if not re.search(r"_{3,}", stem_part):
            if re.search(r"[。.!?]\s*$", stem_part):
                stem_part = re.sub(r"([。.!?])\s*$", r" ____\1", stem_part)
            else:
                stem_part = stem_part.rstrip() + " ____"

        blank_matches = list(re.finditer(r"_{3,}", stem_part))
        if len(blank_matches) > 1:
            first_start, first_end = blank_matches[0].span()
            stem_part = (
                stem_part[:first_start]
                + "____"
                + re.sub(r"_{3,}", "", stem_part[first_end:])
            )

        normalized = stem_part.strip()
        if tail_part:
            normalized += "\n" + tail_part
        normalized_blocks.append(normalized.strip())

    return "\n\n".join(normalized_blocks).strip()


# ── AI repair & scoring ──

async def _repair_output_format(
    *,
    draft_text: str,
    question_type: str,
    expected_count: int,
    output_language: str,
    provider: str | None = None,
    runtime: Any | None = None,
) -> str:
    qtype = _question_type_key(question_type)
    type_hint = _build_question_type_format_hint(question_type)
    language_hint = "English" if str(output_language or "").strip().lower().startswith("english") else "Chinese"
    prompt = (
        "You are a strict formatter for educational question sets. "
        "Rewrite the draft below into a complete, valid markdown question set without dropping questions. "
        f"Question type: {question_type}. Expected count: {expected_count}. Output language: {language_hint}. "
        f"{type_hint} "
        "Every question must include explicit Answer and Explanation lines. "
        "For multiple choice include A/B/C/D options. "
        "Return markdown only, no commentary.\n\n"
        "[Draft]\n"
        f"{str(draft_text or '').strip()}"
    )

    ai_service = get_ai_gateway_service()
    context = {"coze_user_id": "sub2_user", "qtype": qtype}
    if runtime is not None:
        repaired = await ai_service.chat_with_runtime(
            message=prompt,
            context=context,
            runtime=runtime,
            allow_fallback=False,
        )
    else:
        if not provider:
            raise ValueError("provider or runtime is required for question repair")
        repaired = await ai_service.chat_with_provider(
            message=prompt,
            context=context,
            provider=provider,
            allow_fallback=False,
        )
    return str(repaired or "").strip()


def _score_question_item(question: str) -> dict[str, Any]:
    text = str(question or "")
    length = len(text)
    complexity = min(1.0, max(0.2, (length / 140.0)))
    has_numeric = bool(re.search(r"\d", text))
    has_verb = bool(re.search(r"\b(explain|derive|compare|analyze|prove|calculate|design|evaluate)\b", text, re.IGNORECASE))
    quality = round(min(1.0, 0.45 + complexity * 0.35 + (0.1 if has_numeric else 0.0) + (0.1 if has_verb else 0.0)), 3)

    tags: list[str] = []
    if re.search(r"\b(define|what is|state)\b", text, re.IGNORECASE):
        tags.append("concept_recall")
    if re.search(r"\b(calculate|compute|derive)\b", text, re.IGNORECASE):
        tags.append("quantitative")
    if re.search(r"\b(compare|analyze|evaluate|why)\b", text, re.IGNORECASE):
        tags.append("reasoning")
    if not tags:
        tags.append("general")

    return {
        "quality_score": quality,
        "coverage_tags": tags,
        "difficulty_estimate": "high" if quality >= 0.82 else ("medium" if quality >= 0.68 else "low"),
    }
