"""Evidence packing and answer post-check helpers for course RAG."""
from __future__ import annotations

import re
from typing import Any, Dict, List

from backend.config import Config

from .text_ops import is_claim_like, normalize_for_dedup, split_sentences, tokenize_text


def expand_chunk_window(result: Dict[str, Any], store: Any, window: int = 1) -> Dict[str, Any]:
    doc_name = result.get("doc_name", "")
    chunk_id = result.get("chunk_id")
    section_path = result.get("heading_path") or result.get("section_path") or ""
    if chunk_id is None or chunk_id < 0 or not doc_name:
        return result

    chunk_id = int(chunk_id)
    neighbor_ids = list(range(max(0, chunk_id - window), chunk_id + window + 1))

    try:
        data = store.get(
            where={
                "$and": [
                    {"doc_name": {"$eq": doc_name}},
                    {"section_path": {"$eq": section_path}},
                    {"chunk_id": {"$in": neighbor_ids}},
                ]
            },
            include=["documents", "metadatas"],
        )
        docs = data.get("documents") or []
        metas = data.get("metadatas") or []
        if not docs:
            return result

        pairs = sorted(zip(metas, docs), key=lambda pair: int((pair[0] or {}).get("chunk_id", 0)))
        expanded_text = "\n\n".join(doc for _, doc in pairs if doc)
        if not expanded_text.strip():
            return result

        updated = dict(result)
        updated["text"] = expanded_text
        updated["parent_expanded"] = True
        return updated
    except Exception:
        return result


def reorder_for_llm(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    count = len(items)
    if count < 4:
        return items

    result: List[Any] = [None] * count
    left, right = 0, count - 1
    for index, item in enumerate(items):
        if index % 2 == 0:
            result[left] = item
            left += 1
        else:
            result[right] = item
            right -= 1

    return [item for item in result if item is not None]


def pack_evidence(
    retrieved: list[dict[str, Any]],
    *,
    answer_top_k: int,
    max_total_chars: int,
    max_chars_per_chunk: int,
) -> list[dict[str, Any]]:
    if not retrieved:
        return []

    sorted_items = sorted(retrieved, key=lambda item: float(item.get("score", 0.0)), reverse=True)
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in sorted_items:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        key = normalize_for_dedup(text)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    budget = max(120, int(max_total_chars))
    per_chunk = max(64, int(max_chars_per_chunk))
    packed: list[dict[str, Any]] = []
    remaining = budget

    for index, item in enumerate(deduped, start=1):
        if len(packed) >= max(1, int(answer_top_k)):
            break
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        limit = min(per_chunk, remaining)
        if limit < 64:
            break
        chunks = _sentence_spans(text, limit)
        clipped = "".join(chunk["text"] for chunk in chunks).strip()
        if not clipped:
            continue
        entry: dict[str, Any] = {
            "index": index,
            "course_id": item.get("course_id", ""),
            "doc_name": item.get("doc_name", ""),
            "score": float(item.get("score", 0.0)),
            "text": clipped,
            "source_type": item.get("source_type", "course"),
            "page_start": item.get("page_start", item.get("page_num", -1)),
            "page_end": item.get("page_end", item.get("page_num", -1)),
            "chunk_id": item.get("chunk_id", -1),
            "section_path": item.get("section_path", ""),
            "heading_path": item.get("heading_path", item.get("section_path", "")),
            "sentence_offsets": [(span["start"], span["end"]) for span in chunks],
            "retrieval_sources": item.get("retrieval_sources", []),
            "confidence": float(item.get("score", 0.0)),
        }
        if item.get("raw_vector_score") is not None:
            entry["raw_vector_score"] = float(item["raw_vector_score"])
        packed.append(entry)
        remaining -= len(clipped)

    return packed


def build_evidence_spans(retrieved: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for item in retrieved:
        text = str(item.get("text", "") or "")
        spans.append(
            {
                "doc_name": item.get("doc_name", ""),
                "page_start": item.get("page_start", item.get("page_num", -1)),
                "page_end": item.get("page_end", item.get("page_num", -1)),
                "chunk_id": item.get("chunk_id", -1),
                "section_path": item.get("section_path", ""),
                "sentence_offsets": [(0, min(160, len(text)))],
                "source_type": item.get("source_type", "course"),
                "confidence": float(item.get("score", 0.0)),
                "retrieval_sources": item.get("retrieval_sources", []),
            }
        )
    return spans[: max(1, int(Config.RAG_EVIDENCE_MAX_SPANS))]


def evidence_insufficient_message(language_hint: str = "") -> str:
    return "I do not have enough evidence in your course materials to answer reliably. Please provide more context or upload relevant references."


def should_retry_empty(*, first_result_count: int, retry_enabled: bool) -> bool:
    return bool(retry_enabled and int(first_result_count) <= 0)


def should_return_insufficient(*, second_result_count: int) -> bool:
    return int(second_result_count) <= 0


def postcheck_and_downgrade(answer: str, evidence_cards: list[dict[str, Any]]) -> tuple[str, int]:
    content = str(answer or "").strip()
    if not content or not evidence_cards:
        return content, 0

    evidence_text = "\n".join(str(card.get("text", "")) for card in evidence_cards)
    evidence_tokens = tokenize_text(evidence_text)
    if not evidence_tokens:
        return content, 0

    threshold = getattr(Config, "RAG_POSTCHECK_OVERLAP_THRESHOLD", 0.18)
    downgraded_count = 0
    rewritten: list[str] = []

    for sentence in split_sentences(content):
        stripped = sentence.strip()
        if not stripped:
            continue
        if not is_claim_like(stripped):
            rewritten.append(stripped)
            continue

        sentence_tokens = tokenize_text(stripped)
        overlap = len(sentence_tokens & evidence_tokens) / max(1, len(sentence_tokens))
        if overlap >= threshold:
            rewritten.append(stripped)
            continue

        downgraded_count += 1
        rewritten.append(f"{stripped} (uncertain, evidence not explicit)")

    return " ".join(rewritten).strip(), downgraded_count


def _sentence_spans(text: str, limit: int) -> list[dict[str, Any]]:
    clipped = str(text or "")[: max(1, int(limit))]
    pieces = re.split(r"(?<=[.!?;。！？；])\s+", clipped)
    spans: list[dict[str, Any]] = []
    cursor = 0
    for piece in pieces:
        if not piece.strip():
            cursor += len(piece)
            continue
        start = clipped.find(piece, cursor)
        if start < 0:
            start = cursor
        end = min(len(clipped), start + len(piece))
        spans.append({"start": start, "end": end, "text": piece.strip()})
        cursor = end
        if end >= len(clipped):
            break
    if not spans and clipped.strip():
        spans.append({"start": 0, "end": len(clipped), "text": clipped.strip()})
    return spans


__all__ = [
    "build_evidence_spans",
    "evidence_insufficient_message",
    "expand_chunk_window",
    "pack_evidence",
    "postcheck_and_downgrade",
    "reorder_for_llm",
    "should_retry_empty",
    "should_return_insufficient",
]
