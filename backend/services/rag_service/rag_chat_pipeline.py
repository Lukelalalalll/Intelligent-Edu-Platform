from __future__ import annotations

from typing import Any

from backend.services.course_rag_service.retrieval_helpers import (
    evidence_insufficient_message,
    pack_evidence,
    postcheck_and_downgrade,
    should_retry_empty,
    should_return_insufficient,
)


def task_profile_for_phase(phase: str) -> str:
    p = str(phase or "").strip().lower()
    if p in {"rewrite", "intent", "light"}:
        return "light"
    return "heavy"


def build_rewrite_prompt(question: str, tutor_mode: str = "tutor") -> str:
    mode = str(tutor_mode or "tutor").strip().lower()
    mode_hint = "Keep concise intent terms." if mode == "hint_only" else "Keep enough detail for retrieval precision."
    return (
        "Rewrite the user query for document retrieval.\n"
        "Rules:\n"
        "1) Keep original intent, language, and constraints.\n"
        "2) Expand with key terms that improve retrieval.\n"
        "3) Return ONE line only, no explanation.\n"
        f"4) {mode_hint}\n\n"
        f"User query: {str(question or '').strip()}"
    )


def sanitize_rewrite_output(original_query: str, rewritten: str, max_chars: int = 240) -> str:
    base = str(original_query or "").strip()
    candidate = str(rewritten or "").strip()
    if not candidate:
        return base
    first_line = candidate.splitlines()[0].strip().strip('"').strip("'")
    if not first_line:
        return base
    if len(first_line) > max_chars:
        first_line = first_line[:max_chars].strip()
    return first_line or base


__all__ = [
    "build_rewrite_prompt",
    "evidence_insufficient_message",
    "pack_evidence",
    "postcheck_and_downgrade",
    "sanitize_rewrite_output",
    "should_retry_empty",
    "should_return_insufficient",
    "task_profile_for_phase",
]
