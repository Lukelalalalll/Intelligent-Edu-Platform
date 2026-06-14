"""Query handling: BM25 index cache, neural reranking, and retrieval orchestration."""

import logging
import threading
from typing import Any, Dict, List, Optional

from backend.config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BM25 index cache -- avoids full rebuild on every query
# ---------------------------------------------------------------------------

class _BM25CacheEntry:
    __slots__ = ("bm25", "ids", "texts", "metadatas", "doc_count", "corpus_tokens")

    def __init__(self, bm25, ids: list, texts: list, metadatas: list, doc_count: int, corpus_tokens: list):
        self.bm25 = bm25
        self.ids = ids
        self.texts = texts
        self.metadatas = metadatas
        self.doc_count = doc_count
        self.corpus_tokens = corpus_tokens


_bm25_cache: Dict[str, _BM25CacheEntry] = {}
_bm25_cache_lock: Optional[threading.Lock] = None


def _get_bm25_lock():
    global _bm25_cache_lock
    if _bm25_cache_lock is None:
        _bm25_cache_lock = threading.Lock()
    return _bm25_cache_lock


def invalidate_bm25_cache(course_id: str) -> None:
    """Clear the BM25 cache for a course (call after indexing/removal)."""
    _bm25_cache.pop(course_id, None)


def bm25_retrieve_for_course(
    *,
    course_id: str,
    query: str,
    top_k: int,
    meta: dict,
    get_store_fn,
    chapter_id: str = "",
    metadata_filters: Optional[dict] = None,
) -> List[Dict[str, Any]]:
    """BM25 sparse retrieval with in-memory cache.

    Uses Okapi BM25 (Robertson et al., 2009). The BM25 index is cached
    per course and invalidated automatically when the document count changes.
    """
    import re as _re
    from rank_bm25 import BM25Okapi
    import numpy as np

    docs_meta = meta.get("documents", {})
    if not docs_meta:
        return []

    doc_chapter_map = {
        str(name): str(info.get("chapter_id") or "")
        for name, info in docs_meta.items()
    }

    def _tokenize(text: str) -> List[str]:
        raw = _re.findall(r"[a-zA-Z0-9一-鿿]+", str(text or "").lower())
        result: List[str] = []
        for t in raw:
            result.append(t)
            expanded = _re.sub(r'([a-z])(\d)', r'\1 \2', t)
            expanded = _re.sub(r'(\d)([a-z])', r'\1 \2', expanded)
            if expanded != t:
                result.extend(p for p in expanded.split() if p)
        return result

    store = get_store_fn(course_id)
    try:
        collection = store._collection
        current_count = collection.count()
    except Exception:
        logger.warning("BM25: failed to access collection for course %s", course_id, exc_info=True)
        return []

    lock = _get_bm25_lock()
    with lock:
        entry = _bm25_cache.get(course_id)
        if entry and entry.doc_count == current_count:
            pass
        elif entry and current_count > entry.doc_count:
            try:
                data = collection.get(include=["documents", "metadatas"])
                texts = data.get("documents") or []
                metas = data.get("metadatas") or []
                ids_list = data.get("ids") or []
                if not texts:
                    return []
                old_id_set = set(entry.ids)
                new_corpus_tokens = list(entry.corpus_tokens)
                new_ids = list(entry.ids)
                new_texts = list(entry.texts)
                new_metas = list(entry.metadatas)
                for i, cid_item in enumerate(ids_list):
                    if cid_item not in old_id_set:
                        new_corpus_tokens.append(_tokenize(texts[i]))
                        new_ids.append(cid_item)
                        new_texts.append(texts[i])
                        new_metas.append(metas[i] if i < len(metas) else {})
                bm25_obj = BM25Okapi(new_corpus_tokens, k1=1.5, b=0.75)
                entry = _BM25CacheEntry(
                    bm25=bm25_obj, ids=new_ids,
                    texts=new_texts, metadatas=new_metas,
                    doc_count=current_count,
                    corpus_tokens=new_corpus_tokens,
                )
                _bm25_cache[course_id] = entry
            except Exception:
                logger.warning("BM25: incremental update failed, doing full rebuild", exc_info=True)
                entry = None

        if entry is None:
            try:
                data = collection.get(include=["documents", "metadatas"])
                texts = data.get("documents") or []
                metas = data.get("metadatas") or []
                ids_list = data.get("ids") or []
                if not texts:
                    return []
                corpus_tokens = [_tokenize(t) for t in texts]
                bm25_obj = BM25Okapi(corpus_tokens, k1=1.5, b=0.75)
                entry = _BM25CacheEntry(
                    bm25=bm25_obj, ids=ids_list,
                    texts=texts, metadatas=metas,
                    doc_count=current_count,
                    corpus_tokens=corpus_tokens,
                )
                _bm25_cache[course_id] = entry
            except Exception:
                logger.warning("BM25: failed to rebuild index", exc_info=True)
                return []

    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    try:
        scores = entry.bm25.get_scores(query_tokens)
    except Exception:
        return []

    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    active_filters = metadata_filters or {}
    for idx in top_indices:
        score = float(scores[idx])
        if score < 0.01:
            continue
        text = entry.texts[idx] if idx < len(entry.texts) else ""
        md = entry.metadatas[idx] if idx < len(entry.metadatas) else {}
        md = md or {}
        c_doc_name = md.get("doc_name", "")
        node_type = str(md.get("node_type") or "leaf_chunk")
        if node_type not in {"leaf_chunk", "table_chunk", "section_summary"}:
            continue
        c_chapter = md.get("chapter_id", "") or doc_chapter_map.get(str(c_doc_name), "")
        if chapter_id and str(c_chapter) != chapter_id:
            continue
        if active_filters.get("doc_name") and str(c_doc_name) != str(active_filters["doc_name"]):
            continue
        if active_filters.get("node_type") and str(node_type) != str(active_filters["node_type"]):
            continue
        if active_filters.get("section_path") and str(md.get("section_path", "")) != str(active_filters["section_path"]):
            continue
        if active_filters.get("heading_level") and int(md.get("heading_level", 0) or 0) != int(active_filters["heading_level"]):
            continue
        page_start = int(md.get("page_start", md.get("page_num", -1)) or -1)
        page_end = int(md.get("page_end", md.get("page_num", -1)) or -1)
        if active_filters.get("page_start") and page_start != int(active_filters["page_start"]):
            continue
        if active_filters.get("page_end") and page_end != int(active_filters["page_end"]):
            continue
        query_tokens_set = set(query_tokens)
        title_tokens = set(_tokenize(str(md.get("section_title", "")) or str(c_doc_name or "")))
        body_tokens = set(_tokenize(text))
        title_overlap = len(query_tokens_set & title_tokens) / max(1, len(query_tokens_set))
        heading_overlap = len(query_tokens_set & set(_tokenize(str(md.get("heading_path", ""))))) / max(1, len(query_tokens_set))
        lexical_overlap = len(query_tokens_set & body_tokens) / max(1, len(query_tokens_set))
        filter_match = 1.0 if active_filters else 0.0
        results.append({
            "course_id": course_id,
            "text": text,
            "score": round(score, 4),
            "sparse_score": round(score, 4),
            "retrieval_score": round(score, 4),
            "doc_name": c_doc_name,
            "chapter_id": c_chapter,
            "section_title": md.get("section_title", ""),
            "section_path": md.get("section_path", ""),
            "heading_path": md.get("heading_path", md.get("section_path", "")),
            "chunk_id": md.get("chunk_id", -1),
            "page_num": md.get("page_num", -1),
            "page_start": page_start,
            "page_end": page_end,
            "node_type": node_type,
            "element_type": md.get("element_type", "paragraph"),
            "parser_used": md.get("parser_used", ""),
            "token_count": md.get("token_count", 0),
            "index_version": md.get("index_version", ""),
            "retrieval_sources": ["bm25"],
            "source_rank": int(len(results)),
            "title_overlap": round(title_overlap, 4),
            "heading_overlap": round(heading_overlap, 4),
            "lexical_overlap": round(lexical_overlap, 4),
            "filter_match": filter_match,
            "heading_level": int(md.get("heading_level", 0) or 0),
        })
    return results


# ---------------------------------------------------------------------------
# Neural cross-encoder reranking (optional, config-gated)
# ---------------------------------------------------------------------------

def maybe_neural_rerank(query: str, items: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    """Apply neural cross-encoder reranking if enabled and worthwhile (P0-3)."""
    if not Config.RAG_NEURAL_RERANK_ENABLED or not items:
        return items

    if len(items) <= top_k:
        return items
    if len(items) <= top_k + 2:
        return items[:top_k]

    norm_scores = [float(i.get("_norm_score", 0.0)) for i in items[:top_k]]
    if len(norm_scores) > 1:
        mean = sum(norm_scores) / len(norm_scores)
        stddev = (sum((x - mean) ** 2 for x in norm_scores) / (len(norm_scores) - 1)) ** 0.5
        if stddev < 0.04:
            return items[:top_k]

    try:
        from .reranker import neural_rerank
        candidates = items[:Config.RAG_NEURAL_RERANK_CANDIDATES]
        return neural_rerank(query, candidates, top_k)
    except Exception:
        logger.debug("Neural rerank unavailable, using lexical ranking", exc_info=True)
        return items
