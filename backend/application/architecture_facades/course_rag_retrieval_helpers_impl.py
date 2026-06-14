"""Reranking, fusion, evidence packing, and text-similarity helpers."""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Any, Dict, List

from backend.config import Config


def doc_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _expand_alphanum(token: str) -> list[str]:
    parts = [token]
    expanded = re.sub(r"([a-z])(\d)", r"\1 \2", token)
    expanded = re.sub(r"(\d)([a-z])", r"\1 \2", expanded)
    if expanded != token:
        parts.extend(p for p in expanded.split() if p)
    return parts


def normalize_query_for_retrieval(query: str) -> str:
    q = str(query or "").strip()
    q = re.sub(r"([a-zA-Z])(\d)", r"\1 \2", q)
    q = re.sub(r"(\d)([a-zA-Z])", r"\1 \2", q)
    return q


def tokenize_for_rerank(text: str) -> set[str]:
    raw_tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    result: set[str] = set()
    for t in raw_tokens:
        for part in _expand_alphanum(t):
            if len(part) >= 2 or part.isdigit():
                result.add(part)
    return result


def rerank_results(query: str, items: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    if not items:
        return []

    query_tokens = tokenize_for_rerank(query)
    if not query_tokens:
        return items[:top_k]

    dedup: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = hashlib.sha1(str(item.get("text", "")).encode("utf-8", errors="ignore")).hexdigest()
        if key not in dedup or float(item.get("score", 0.0)) > float(dedup[key].get("score", 0.0)):
            dedup[key] = item

    base_scores = [float(item.get("score", 0.0)) for item in dedup.values()]
    max_base = max(base_scores) if base_scores else 1.0
    rescored: List[Dict[str, Any]] = []
    for item in dedup.values():
        base = float(item.get("score", 0.0))
        norm_score = base / max(max_base, 1e-9)
        text_tokens = tokenize_for_rerank(item.get("text", ""))
        title_tokens = tokenize_for_rerank(item.get("section_title", "") or item.get("doc_name", ""))
        heading_tokens = tokenize_for_rerank(item.get("heading_path", "") or item.get("section_path", ""))
        overlap = len(query_tokens & text_tokens) / max(1, len(query_tokens))
        title_overlap = len(query_tokens & title_tokens) / max(1, len(query_tokens))
        heading_overlap = len(query_tokens & heading_tokens) / max(1, len(query_tokens))
        filter_match = float(item.get("filter_match", 0.0) or 0.0)
        node_type_bonus = 0.08 if str(item.get("node_type", "")).startswith("section_") else 0.0
        final_score = 0.50 * norm_score + 0.20 * overlap + 0.10 * title_overlap + 0.10 * heading_overlap + 0.06 * filter_match + node_type_bonus
        enriched = dict(item)
        enriched["score"] = round(final_score, 4)
        enriched["retrieval_score"] = round(base, 4)
        enriched["overlap_score"] = round(overlap, 4)
        enriched["title_overlap"] = round(title_overlap, 4)
        enriched["heading_overlap"] = round(heading_overlap, 4)
        enriched["_norm_score"] = norm_score
        rescored.append(enriched)

    rescored.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return rescored[:top_k]


def fusion_merge(
    results_lists: List[List[Dict[str, Any]]],
    *,
    query_class: str,
    top_k: int,
) -> List[Dict[str, Any]]:
    if not results_lists:
        return []

    ranked_pool: Dict[str, Dict[str, Any]] = {}
    feature_weights = _weights_for_query_class(query_class)

    for list_idx, results in enumerate(results_lists):
        for rank, item in enumerate(results):
            key = _candidate_key(item)
            candidate = dict(ranked_pool.get(key) or item)
            candidate.setdefault("retrieval_sources", [])
            candidate["retrieval_sources"] = sorted(set(candidate.get("retrieval_sources", [])) | set(item.get("retrieval_sources", [])))
            candidate["course_id"] = item.get("course_id", candidate.get("course_id", ""))
            candidate["doc_name"] = item.get("doc_name", candidate.get("doc_name", ""))
            candidate["text"] = item.get("text", candidate.get("text", ""))
            candidate["fusion_features"] = _merge_features(candidate.get("fusion_features", {}), item, rank=rank, list_idx=list_idx)
            ranked_pool[key] = candidate

    rescored: list[dict[str, Any]] = []
    for item in ranked_pool.values():
        feats = item.get("fusion_features", {})
        score = _score_candidate(feats, feature_weights)
        enriched = dict(item)
        enriched["score"] = round(score, 4)
        enriched["fusion_score"] = round(score, 4)
        enriched["source_rank"] = int(feats.get("best_rank", 99))
        rescored.append(enriched)

    rescored.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return rescored[: max(1, top_k)]


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

        pairs = sorted(zip(metas, docs), key=lambda x: int((x[0] or {}).get("chunk_id", 0)))
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
    n = len(items)
    if n < 4:
        return items

    result: List[Any] = [None] * n
    left, right = 0, n - 1
    for i, item in enumerate(items):
        if i % 2 == 0:
            result[left] = item
            left += 1
        else:
            result[right] = item
            right -= 1

    return [x for x in result if x is not None]


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

    budget = max(120, int(max_total_chars))
    per_chunk = max(64, int(max_chars_per_chunk))
    packed: list[dict[str, Any]] = []
    spans: list[dict[str, Any]] = []
    remaining = budget

    for idx, item in enumerate(deduped, start=1):
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
            "index": idx,
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
        spans.extend(chunks)
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

    evidence_text = "\n".join(str(c.get("text", "")) for c in evidence_cards)
    evidence_tokens = _tokenize(evidence_text)
    if not evidence_tokens:
        return content, 0

    threshold = getattr(Config, "RAG_POSTCHECK_OVERLAP_THRESHOLD", 0.18)
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
        if overlap >= threshold:
            rewritten.append(s)
            continue

        downgraded_count += 1
        rewritten.append(f"{s} (uncertain, evidence not explicit)")

    return " ".join(rewritten).strip(), downgraded_count


def _candidate_key(item: Dict[str, Any]) -> str:
    text_sig = hashlib.sha1(str(item.get("text", "")).encode("utf-8", errors="ignore")).hexdigest()[:16]
    return f"{item.get('course_id','')}_{item.get('doc_name','')}_{text_sig}"


def _merge_features(existing: dict[str, Any], item: Dict[str, Any], *, rank: int, list_idx: int) -> dict[str, Any]:
    feats = dict(existing or {})
    feats["dense_score"] = max(float(feats.get("dense_score", 0.0)), float(item.get("raw_vector_score", 0.0) or 0.0))
    feats["sparse_score"] = max(float(feats.get("sparse_score", 0.0)), float(item.get("sparse_score", item.get("retrieval_score", 0.0)) or 0.0))
    feats["title_overlap"] = max(float(feats.get("title_overlap", 0.0)), float(item.get("title_overlap", 0.0) or 0.0))
    feats["heading_overlap"] = max(float(feats.get("heading_overlap", 0.0)), float(item.get("heading_overlap", 0.0) or 0.0))
    feats["filter_match"] = max(float(feats.get("filter_match", 0.0)), float(item.get("filter_match", 0.0) or 0.0))
    feats["node_bonus"] = max(float(feats.get("node_bonus", 0.0)), _node_bonus(str(item.get("node_type", ""))))
    feats["query_prior"] = max(float(feats.get("query_prior", 0.0)), float(item.get("query_prior", 0.0) or 0.0))
    feats["best_rank"] = min(int(feats.get("best_rank", 999)), int(rank) + 1)
    feats["source_count"] = int(feats.get("source_count", 0)) + 1
    feats["list_bias"] = min(float(feats.get("list_bias", 0.0)) + (0.02 if list_idx == 0 else 0.0), 0.05)
    feats["retrieval_score"] = max(float(feats.get("retrieval_score", 0.0)), float(item.get("score", 0.0)))
    return feats


def _score_candidate(feats: dict[str, Any], weights: dict[str, float]) -> float:
    return (
        weights["dense"] * float(feats.get("dense_score", 0.0))
        + weights["sparse"] * float(feats.get("sparse_score", 0.0))
        + weights["title"] * float(feats.get("title_overlap", 0.0))
        + weights["heading"] * float(feats.get("heading_overlap", 0.0))
        + weights["filter"] * float(feats.get("filter_match", 0.0))
        + weights["node"] * float(feats.get("node_bonus", 0.0))
        + weights["prior"] * float(feats.get("query_prior", 0.0))
        + weights["list_bias"] * float(feats.get("list_bias", 0.0))
        + weights["rank"] * (1.0 / max(1.0, float(feats.get("best_rank", 1))))
    )


def _weights_for_query_class(query_class: str) -> dict[str, float]:
    base = {
        "dense": 0.30,
        "sparse": 0.30,
        "title": 0.12,
        "heading": 0.10,
        "filter": 0.10,
        "node": 0.04,
        "prior": 0.02,
        "list_bias": 0.01,
        "rank": 0.01,
    }
    if query_class == "keyword/factoid":
        base.update({"sparse": 0.42, "dense": 0.24, "filter": 0.12})
    elif query_class == "concept/explanation":
        base.update({"dense": 0.38, "sparse": 0.22, "title": 0.14})
    elif query_class == "comparison":
        base.update({"dense": 0.28, "sparse": 0.24, "heading": 0.16, "prior": 0.08})
    elif query_class == "multi-hop":
        base.update({"dense": 0.26, "sparse": 0.22, "heading": 0.18, "prior": 0.10})
    elif query_class == "chapter/doc constrained":
        base.update({"filter": 0.22, "sparse": 0.26, "dense": 0.24})
    elif query_class == "out-of-domain":
        base.update({"dense": 0.18, "sparse": 0.18, "prior": 0.0})
    return base


def _node_bonus(node_type: str) -> float:
    if node_type == "section_summary":
        return 0.12
    if node_type == "table_chunk":
        return 0.08
    return 0.0


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


def _normalize_for_dedup(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())[:180]


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
    return {t for t in tokens if len(t) >= 2 and t not in _STOP_TOKENS}


_STOP_TOKENS = {
    "a", "an", "and", "all", "are", "as", "at", "be", "by", "for", "from", "has",
    "in", "is", "it", "of", "on", "or", "that", "the", "their", "this", "to", "under", "with",
}
