from __future__ import annotations

import re
from typing import Any


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


def pack_evidence(
    retrieved: list[dict[str, Any]],
    *,
    answer_top_k: int,
    max_total_chars: int,
    max_chars_per_chunk: int,
) -> list[dict[str, Any]]:
    if not retrieved:
        return []

    sorted_items = sorted(retrieved, key=lambda x: float(x.get("score", 0.0)), reverse=True)
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in sorted_items:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        key = _normalize_for_dedup(text)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    packed: list[dict[str, Any]] = []
    total_chars = 0
    for idx, item in enumerate(deduped, start=1):
        if len(packed) >= max(1, int(answer_top_k)):
            break
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        clipped = text[:max(32, int(max_chars_per_chunk))]
        if total_chars + len(clipped) > max(120, int(max_total_chars)):
            break
        packed.append(
            {
                "index": idx,
                "course_id": item.get("course_id", ""),
                "doc_name": item.get("doc_name", ""),
                "score": float(item.get("score", 0.0)),
                "text": clipped,
            }
        )
        total_chars += len(clipped)

    return packed


def evidence_insufficient_message(language_hint: str = "") -> str:
    lower = str(language_hint or "").lower()
    if re.search(r"[\u4e00-\u9fff]", lower):
        return "I do not have enough evidence in your course materials to answer reliably. Please provide more context or upload relevant references."
    return "I do not have enough evidence in your course materials to answer reliably. Please provide more context or upload relevant references."


def should_retry_empty(*, first_result_count: int, retry_enabled: bool) -> bool:
    return bool(retry_enabled and int(first_result_count) <= 0)


def should_return_insufficient(*, second_result_count: int) -> bool:
    return int(second_result_count) <= 0


def postcheck_and_downgrade(answer: str, evidence_cards: list[dict[str, Any]]) -> tuple[str, int]:
    content = str(answer or "").strip()
    if not content:
        return content, 0
    if not evidence_cards:
        return content, 0

    evidence_text = "\n".join(str(c.get("text", "")) for c in evidence_cards)
    evidence_tokens = _tokenize(evidence_text)
    if not evidence_tokens:
        return content, 0

    downgraded_count = 0
    sentences = _split_sentences(content)
    rewritten: list[str] = []

    for sent in sentences:
        s = sent.strip()
        if not s:
            continue
        if not _is_claim_like(s):
            rewritten.append(s)
            continue

        sent_tokens = _tokenize(s)
        overlap = len(sent_tokens & evidence_tokens) / max(1, len(sent_tokens))
        if overlap >= 0.28:
            rewritten.append(s)
            continue

        downgraded_count += 1
        rewritten.append(f"{s} (uncertain, evidence not explicit)")

    return " ".join(rewritten).strip(), downgraded_count


def _normalize_for_dedup(text: str) -> str:
    compact = re.sub(r"\s+", " ", str(text or "").strip().lower())
    return compact[:180]


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;。！？；])\s+", str(text or "").strip())
    return [p for p in parts if p]


def _is_claim_like(sentence: str) -> bool:
    s = str(sentence or "").strip()
    if len(s) < 18:
        return False
    if s.endswith("?") or s.endswith("？"):
        return False
    return True


def _tokenize(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    return {t for t in tokens if len(t) >= 2}
