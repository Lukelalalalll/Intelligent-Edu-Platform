"""Semantic retrieval cache for RAG queries.

Caches retrieval results by (sorted course_ids, normalized query) to avoid
redundant vector + BM25 searches for repeated or near-identical student queries.

P1-3: Two-layer cache — exact match (L1) + embedding fuzzy match (L2).
P2-3: TTL and capacity are now configurable via Config.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from cachetools import TTLCache

from backend.config import Config

logger = logging.getLogger(__name__)

# ── L1: Exact match cache (configurable TTL + capacity) ──────────
_retrieval_cache: TTLCache = TTLCache(
    maxsize=int(Config.RAG_CACHE_MAX_ENTRIES),
    ttl=int(Config.RAG_CACHE_TTL_SECONDS),
)

# ── L2: Embedding-based fuzzy cache (P1-3) ───────────────────────
# Stores (query_embedding, results) keyed by exact cache key.
# Uses OrderedDict for LRU eviction.
_embedding_cache: OrderedDict[str, Tuple[np.ndarray, List[Dict[str, Any]]]] = OrderedDict()
_embedding_cache_lock = threading.Lock()
_EMBEDDING_CACHE_MAX = int(Config.RAG_SEMANTIC_CACHE_MAX_ENTRIES)

# Lazy-loaded embedding function (uses the already-loaded bge-m3 model)
_embed_fn = None
_embed_fn_lock = threading.Lock()


def _get_embed_fn():
    """Get or lazily initialize the embedding function (singleton)."""
    global _embed_fn
    if _embed_fn is None:
        with _embed_fn_lock:
            if _embed_fn is None:
                from backend.services.course_rag_service import course_rag_service
                _embed_fn = course_rag_service.embeddings
    return _embed_fn


def _cache_key(
    course_ids: List[str],
    query: str,
    *,
    use_hybrid: bool = True,
    rag_profile: str = "",
    force_query_class: str = "",
    chapter_id: str = "",
    metadata_filters: Optional[dict[str, Any]] = None,
) -> str:
    filter_sig = ""
    if metadata_filters:
        filter_sig = "|".join(f"{k}={metadata_filters[k]}" for k in sorted(metadata_filters))
    norm = " ".join(sorted(course_ids)) + "|" + query.lower().strip()
    norm += f"|hybrid={int(bool(use_hybrid))}|profile={rag_profile}|qclass={force_query_class}|chapter={chapter_id}|filters={filter_sig}"
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()


def get_cached_results(
    course_ids: List[str],
    query: str,
    *,
    use_hybrid: bool = True,
    rag_profile: str = "",
    force_query_class: str = "",
    chapter_id: str = "",
    metadata_filters: Optional[dict[str, Any]] = None,
) -> Optional[List[Dict[str, Any]]]:
    """Return cached retrieval results or None.

    L1: exact key match (fast).
    L2: embedding cosine similarity > threshold (P1-3).
    """
    key = _cache_key(
        course_ids,
        query,
        use_hybrid=use_hybrid,
        rag_profile=rag_profile,
        force_query_class=force_query_class,
        chapter_id=chapter_id,
        metadata_filters=metadata_filters,
    )

    # L1: exact match
    exact = _retrieval_cache.get(key)
    if exact is not None:
        return exact

    # L2: semantic fuzzy match
    if not Config.RAG_SEMANTIC_CACHE_ENABLED:
        return None
    try:
        embed_fn = _get_embed_fn()
        q_emb = np.array(embed_fn.embed_query(query), dtype=np.float32)
        threshold = float(Config.RAG_SEMANTIC_CACHE_THRESHOLD)

        with _embedding_cache_lock:
            for cached_key, (cached_emb, cached_result) in _embedding_cache.items():
                sim = float(np.dot(q_emb, cached_emb) / (
                    np.linalg.norm(q_emb) * np.linalg.norm(cached_emb) + 1e-9
                ))
                if sim >= threshold:
                    logger.debug("RAG semantic cache hit (sim=%.3f) key=%s", sim, cached_key[:12])
                    # Move to end (most recently used)
                    _embedding_cache.move_to_end(cached_key)
                    return cached_result
    except Exception:
        logger.debug("Semantic cache lookup failed, skipping L2", exc_info=True)

    return None


def set_cached_results(
    course_ids: List[str],
    query: str,
    results: List[Dict[str, Any]],
    *,
    use_hybrid: bool = True,
    rag_profile: str = "",
    force_query_class: str = "",
    chapter_id: str = "",
    metadata_filters: Optional[dict[str, Any]] = None,
) -> None:
    """Store retrieval results in both L1 (exact) and L2 (embedding) caches."""
    key = _cache_key(
        course_ids,
        query,
        use_hybrid=use_hybrid,
        rag_profile=rag_profile,
        force_query_class=force_query_class,
        chapter_id=chapter_id,
        metadata_filters=metadata_filters,
    )

    # L1: exact cache
    _retrieval_cache[key] = results

    # L2: embedding cache
    if not Config.RAG_SEMANTIC_CACHE_ENABLED:
        return
    try:
        embed_fn = _get_embed_fn()
        q_emb = np.array(embed_fn.embed_query(query), dtype=np.float32)
        with _embedding_cache_lock:
            _embedding_cache[key] = (q_emb, results)
            _embedding_cache.move_to_end(key)
            # LRU eviction
            while len(_embedding_cache) > _EMBEDDING_CACHE_MAX:
                _embedding_cache.popitem(last=False)
    except Exception:
        logger.debug("Failed to store in semantic cache", exc_info=True)


def invalidate_course_cache(course_id: str) -> None:
    """Remove all cache entries containing a specific course_id."""
    # L1
    keys_to_remove = [
        k for k, v in _retrieval_cache.items()
        if any(r.get("course_id") == course_id for r in (v or []))
    ]
    for k in keys_to_remove:
        _retrieval_cache.pop(k, None)

    # L2
    with _embedding_cache_lock:
        keys_to_remove_l2 = [
            k for k, (_, results) in _embedding_cache.items()
            if any(r.get("course_id") == course_id for r in (results or []))
        ]
        for k in keys_to_remove_l2:
            _embedding_cache.pop(k, None)
