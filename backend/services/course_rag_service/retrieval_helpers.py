"""Reranking, Reciprocal Rank Fusion, and text-similarity helpers (pure functions)."""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List


def doc_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _expand_alphanum(token: str) -> list[str]:
    """Expand letter-digit compound tokens.

    'mod1'  → ['mod1', 'mod', '1']
    'h264'  → ['h264', 'h', '264']

    This lets 'mod1' match indexed document names like 'Mod-1-Intro-2025-26'
    which the tokenizer splits into ['mod', '1', 'intro', ...].
    """
    parts = [token]
    expanded = re.sub(r'([a-z])(\d)', r'\1 \2', token)
    expanded = re.sub(r'(\d)([a-z])', r'\1 \2', expanded)
    if expanded != token:
        parts.extend(p for p in expanded.split() if p)
    return parts


def normalize_query_for_retrieval(query: str) -> str:
    """Expand letter-digit boundaries in a query string before retrieval.

    'mod1 content'  → 'mod 1 content'
    'chapter2 notes' → 'chapter 2 notes'

    This improves semantic similarity against document names such as
    'Mod-1-Intro-2025-26' where the tokenizer splits on hyphens.
    """
    q = str(query or "").strip()
    q = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', q)
    q = re.sub(r'(\d)([a-zA-Z])', r'\1 \2', q)
    return q


def tokenize_for_rerank(text: str) -> set[str]:
    raw_tokens = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text or "").lower())
    result: set[str] = set()
    for t in raw_tokens:
        for part in _expand_alphanum(t):
            # Keep tokens with len >= 2, or pure numeric tokens (module numbers)
            if len(part) >= 2 or part.isdigit():
                result.add(part)
    return result


def rerank_results(
    query: str, items: List[Dict[str, Any]], top_k: int,
) -> List[Dict[str, Any]]:
    if not items:
        return []

    query_tokens = tokenize_for_rerank(query)
    if not query_tokens:
        return items[:top_k]

    dedup: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = hashlib.sha1(
            str(item.get("text", "")).encode("utf-8", errors="ignore")
        ).hexdigest()
        if key not in dedup or float(item.get("score", 0.0)) > float(
            dedup[key].get("score", 0.0)
        ):
            dedup[key] = item


    # F-1: Normalize base score to [0,1] for all items
    base_scores = [float(item.get("score", 0.0)) for item in dedup.values()]
    max_base = max(base_scores) if base_scores else 1.0
    rescored: List[Dict[str, Any]] = []
    for item in dedup.values():
        base = float(item.get("score", 0.0))
        norm_score = base / max(max_base, 1e-9)
        text_tokens = tokenize_for_rerank(item.get("text", ""))
        overlap = len(query_tokens & text_tokens) / max(1, len(query_tokens))
        title_tokens = tokenize_for_rerank(
            item.get("section_title", "") or item.get("doc_name", "")
        )
        title_overlap = len(query_tokens & title_tokens) / max(1, len(query_tokens))

        final_score = 0.65 * norm_score + 0.25 * overlap + 0.10 * title_overlap
        enriched = dict(item)
        enriched["score"] = round(final_score, 4)
        enriched["retrieval_score"] = round(base, 4)
        enriched["overlap_score"] = round(overlap, 4)
        enriched["_norm_score"] = norm_score
        rescored.append(enriched)

    rescored.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return rescored[:top_k]


def rrf_merge(
    results_lists: List[List[Dict[str, Any]]],
    k: int = 60,
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    """Merge multiple ranked result lists using Reciprocal Rank Fusion."""
    scores: Dict[str, float] = {}
    items: Dict[str, Dict[str, Any]] = {}

    for results in results_lists:
        for rank, item in enumerate(results):
            text_sig = hashlib.sha1(
                str(item.get("text", "")).encode("utf-8", errors="ignore")
            ).hexdigest()[:16]
            key = f"{item['course_id']}_{item['doc_name']}_{text_sig}"
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            if key not in items:
                items[key] = item

    sorted_keys = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    merged = []
    for key in sorted_keys[:top_k]:
        item = items[key].copy()
        item["score"] = round(scores[key], 4)
        merged.append(item)
    return merged


# ---------------------------------------------------------------------------
# Parent-window chunk expansion
# ---------------------------------------------------------------------------

def expand_chunk_window(
    result: Dict[str, Any],
    store: Any,
    window: int = 1,
) -> Dict[str, Any]:
    """Expand a retrieved child chunk to include neighbouring chunks.

    Uses ChromaDB metadata filters on ``doc_name`` + ``chunk_id`` range to
    fetch adjacent chunks from the same document, then concatenates them in
    document order. The *retrieval score* is preserved from the original hit
    so ranking is unaffected; only the text surfaced to the LLM grows.

    Args:
        result: A single retrieval result dict (must have ``doc_name`` and
                ``chunk_id`` fields in metadata).
        store:  The ``langchain_chroma.Chroma`` store for this course.
        window: Number of neighbouring chunks on each side to include.

    Returns:
        Updated result dict with expanded ``"text"`` (and
        ``"parent_expanded": True``).  Falls back to the original result if
        the ChromaDB query fails or returns nothing.
    """
    doc_name = result.get("doc_name", "")
    chunk_id = result.get("chunk_id")
    if chunk_id is None or chunk_id < 0 or not doc_name:
        return result

    chunk_id = int(chunk_id)
    neighbor_ids = list(range(max(0, chunk_id - window), chunk_id + window + 1))

    try:
        data = store.get(
            where={
                "$and": [
                    {"doc_name": {"$eq": doc_name}},
                    {"chunk_id": {"$in": neighbor_ids}},
                ]
            },
            include=["documents", "metadatas"],
        )
        docs = data.get("documents") or []
        metas = data.get("metadatas") or []
        if not docs:
            return result

        pairs = sorted(
            zip(metas, docs),
            key=lambda x: int((x[0] or {}).get("chunk_id", 0)),
        )
        expanded_text = "\n\n".join(doc for _, doc in pairs if doc)
        if not expanded_text.strip():
            return result

        updated = dict(result)
        updated["text"] = expanded_text
        updated["parent_expanded"] = True
        return updated
    except Exception:
        return result


# ---------------------------------------------------------------------------
# Lost-in-the-Middle mitigation — U-shape reordering
# ---------------------------------------------------------------------------

def reorder_for_llm(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reorder retrieved chunks to mitigate the Lost-in-the-Middle effect.

    LLMs attend most strongly to content at the *beginning* and *end* of their
    context window (Liu et al., 2023 — "Lost in the Middle").  This function
    places the most-relevant chunk first, the second-most-relevant chunk last,
    and fills the middle with remaining chunks in descending relevance order.

    Only applied when there are at least 4 items (otherwise the reordering
    provides no benefit).

    Example with 6 items ranked [1,2,3,4,5,6]:
        output → [1, 3, 5, 6, 4, 2]
    """
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
