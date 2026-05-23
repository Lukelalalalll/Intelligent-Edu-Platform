"""CourseRagService — per-course vector store management for student RAG retrieval.

Uses ChromaDB + sentence-transformers to index course materials uploaded by
teachers and retrieve relevant chunks when students ask questions in AIInteract.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_huggingface import HuggingFaceEmbeddings
try:
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma  # type: ignore[no-redef]

from backend.config import Config
from .chunking import build_chunks, build_structured_chunks
from .document_processor import detect_content_density
from .query_handler import (
    bm25_retrieve_for_course,
    invalidate_bm25_cache,
    maybe_neural_rerank,
)
from .retrieval_helpers import (
    doc_hash,
    expand_chunk_window,
    normalize_query_for_retrieval,
    reorder_for_llm,
    rerank_results,
    rrf_merge,
)

logger = logging.getLogger(__name__)

# ── Thread pool for parallel retrieval (P0-1, P2-2) ──────────────
_retrieval_pool: ThreadPoolExecutor | None = None
_retrieval_pool_lock = threading.Lock()


def _get_retrieval_pool() -> ThreadPoolExecutor:
    """Lazy-init the retrieval thread pool on first use."""
    global _retrieval_pool
    if _retrieval_pool is not None:
        return _retrieval_pool
    with _retrieval_pool_lock:
        if _retrieval_pool is None:
            _retrieval_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="rag-retr")
        return _retrieval_pool


class CourseRagService:
    """Manages per-course vector stores for student RAG retrieval."""

    def __init__(
        self,
        persist_root: str | None = None,
        embedding_model_name: str | None = None,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ):
        self.persist_root = Path(persist_root or Config.RAG_VECTORSTORE_DIR) / "courses"
        self.persist_root.mkdir(parents=True, exist_ok=True)
        self.chunk_size = chunk_size or Config.RAG_CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or Config.RAG_CHUNK_OVERLAP
        self.embedding_model_name = embedding_model_name or Config.RAG_EMBEDDING_MODEL
        self._embeddings: Optional[HuggingFaceEmbeddings] = None
        self._embeddings_lock = threading.Lock()  # P2-1: thread-safe init
        self._meta_locks: Dict[str, threading.Lock] = {}
        self._meta_locks_mutex = threading.Lock()

    @property
    def embeddings(self) -> HuggingFaceEmbeddings:
        if self._embeddings is None:
            with self._embeddings_lock:
                if self._embeddings is None:  # double-checked locking
                    import torch
                    if torch.cuda.is_available():
                        device = "cuda"
                    elif torch.backends.mps.is_available():
                        device = "mps"
                    else:
                        device = "cpu"
                    
                    self._embeddings = HuggingFaceEmbeddings(
                        model_name=self.embedding_model_name,
                        model_kwargs={"device": device},
                        encode_kwargs={"normalize_embeddings": True},
                    )
        return self._embeddings

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _course_dir(self, course_id: str) -> Path:
        folder = self.persist_root / course_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def _meta_path(self, course_id: str) -> Path:
        return self._course_dir(course_id) / "meta.json"

    def _get_meta_lock(self, course_id: str) -> threading.Lock:
        with self._meta_locks_mutex:
            if course_id not in self._meta_locks:
                self._meta_locks[course_id] = threading.Lock()
            return self._meta_locks[course_id]

    def _load_meta(self, course_id: str) -> Dict[str, Any]:
        path = self._meta_path(course_id)
        if not path.exists():
            return {"documents": {}}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"documents": {}}

    def _save_meta(self, course_id: str, payload: Dict[str, Any]) -> None:
        path = self._meta_path(course_id)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # F-4: Module-level Chroma store cache
    _store_cache: Dict[str, Any] = {}
    _store_lock = threading.Lock()

    def _get_store(self, course_id: str) -> Chroma:
        with self._store_lock:
            if course_id not in self._store_cache:
                try:
                    self._store_cache[course_id] = Chroma(
                        collection_name=f"course_{course_id}",
                        embedding_function=self.embeddings,
                        persist_directory=str(self._course_dir(course_id)),
                        collection_metadata={"hnsw:space": "cosine"},
                    )
                except BaseException as e:
                    logger.warning(
                        "Corrupted ChromaDB store for course %s: %s — backing up data dir and rebuilding",
                        course_id,
                        e,
                    )
                    # Rename the corrupted directory to a .bak backup
                    import shutil
                    course_dir = self._course_dir(course_id)
                    backup_dir = course_dir.with_suffix(".bak")
                    # Remove any old backup first
                    if backup_dir.exists():
                        shutil.rmtree(backup_dir, ignore_errors=True)
                    try:
                        course_dir.rename(backup_dir)
                    except OSError:
                        shutil.rmtree(course_dir, ignore_errors=True)
                    # Recreate the directory and reinitialize the store
                    course_dir.mkdir(parents=True, exist_ok=True)
                    self._store_cache[course_id] = Chroma(
                        collection_name=f"course_{course_id}",
                        embedding_function=self.embeddings,
                        persist_directory=str(course_dir),
                        collection_metadata={"hnsw:space": "cosine"},
                    )
            return self._store_cache[course_id]

    # ------------------------------------------------------------------
    # Public API — Indexing (called by teachers)
    # ------------------------------------------------------------------

    def index_document(
        self,
        course_id: str,
        doc_name: str,
        document_text: str,
        chapter_id: str = "",
        progress_callback=None,
    ) -> Dict[str, Any]:
        """Index a single document into a course's vector store.

        Idempotent: re-indexing the same doc with the same content is a no-op.
        ``progress_callback``, if provided, is called as ``progress_callback(pct)``
        with an integer 0-100 indicating vectorization progress.
        """
        if not document_text.strip():
            return {"indexed": False, "reason": "empty document"}

        logger.debug("index_document: START course=%s doc=%s text_len=%d", course_id, doc_name, len(document_text))

        with self._get_meta_lock(course_id):
            meta = self._load_meta(course_id)
            docs_meta = meta.get("documents", {})
            current_hash = doc_hash(document_text)

            if docs_meta.get(doc_name, {}).get("hash") == current_hash:
                return {"indexed": False, "reason": "unchanged", "chunk_count": docs_meta[doc_name].get("chunk_count", 0)}

            store = self._get_store(course_id)

            # Remove old chunks for this document (by stored IDs)
            old_ids = docs_meta.get(doc_name, {}).get("chunk_ids", [])
            if old_ids:
                try:
                    store.delete(ids=old_ids)
                except Exception:
                    logger.debug("Could not delete old chunks by ID for %s/%s", course_id, doc_name)

            # Defensive cleanup: remove any leftover chunks matching this doc_name
            # in case a previous remove_document failed to fully clean ChromaDB.
            try:
                store.delete(where={"doc_name": doc_name})
            except Exception:
                logger.debug("Metadata-based cleanup skipped for %s/%s", course_id, doc_name)

        # Chunk and index — detect math/code-heavy documents for larger chunks
        # (runs outside the lock since it's CPU-heavy and doesn't touch meta)
        chunk_size = self.chunk_size
        chunk_overlap = self.chunk_overlap
        if detect_content_density(document_text) == "math_heavy":
            chunk_size = max(chunk_size, 1600)
            chunk_overlap = max(chunk_overlap, 300)
        chunks = build_structured_chunks(document_text, chunk_size, chunk_overlap)
        if not chunks:
            return {"indexed": False, "reason": "no chunks produced"}

        # ── Contextual Retrieval (Anthropic, Sep 2024) ─────────────────────
        # Prepend a short LLM-generated context sentence to each chunk before
        # embedding.  Gate with RAG_CONTEXTUAL_RETRIEVAL_ENABLED so existing
        # indexed courses are unaffected until teachers choose to re-index.
        if Config.RAG_CONTEXTUAL_RETRIEVAL_ENABLED:
            try:
                from .contextual import add_chunk_context
                chunks = add_chunk_context(chunks, document_text)
                logger.info(
                    "Contextual retrieval: contextualized %d chunks for %s/%s",
                    len(chunks), course_id, doc_name,
                )
            except Exception:
                logger.warning(
                    "Contextual retrieval failed for %s/%s — using plain chunks",
                    course_id, doc_name, exc_info=True,
                )

        # chunks from a previous indexing that wasn't fully cleaned up.
        batch_id = uuid.uuid4().hex[:8]
        ids = [f"{course_id}_{doc_name}_{batch_id}_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "course_id": course_id,
                "doc_name": doc_name,
                "chapter_id": str(chapter_id or ""),
                "chunk_id": i,
                "section_title": c.get("section_title", "Document"),
                "section_path": c.get("section_path", "Document"),
                "heading_level": int(c.get("heading_level", 0) or 0),
                "page_num": int(c.get("page_num", -1) or -1),
                "char_start": int(c.get("char_start", 0) or 0),
                "char_end": int(c.get("char_end", 0) or 0),
                "chunk_chars": len(c.get("text", "")),
            }
            for i, c in enumerate(chunks)
        ]

        # Batch add to avoid OOM on large documents
        all_texts = [c["text"] for c in chunks]
        batch_size = 32
        total = len(all_texts)
        for start in range(0, total, batch_size):
            end = min(start + batch_size, total)
            store.add_texts(
                texts=all_texts[start:end],
                ids=ids[start:end],
                metadatas=metadatas[start:end],
            )
            if progress_callback:
                try:
                    progress_callback(int(end / total * 100))
                except Exception:
                    pass

        with self._get_meta_lock(course_id):
            meta = self._load_meta(course_id)
            docs_meta = meta.get("documents", {})
            docs_meta[doc_name] = {
                "hash": current_hash,
                "chunk_count": len(chunks),
                "chunk_ids": ids,
                "chapter_id": str(chapter_id or ""),
                "structured_chunking": True,
                "indexed_at": datetime.now(timezone.utc).isoformat(),
            }
            meta["documents"] = docs_meta
            self._save_meta(course_id, meta)
            logger.debug("index_document: SAVED meta to %s", self._meta_path(course_id))
            logger.debug("index_document: meta docs: %s", list(docs_meta.keys()))

        invalidate_bm25_cache(course_id)
        from .cache import invalidate_course_cache
        invalidate_course_cache(course_id)
        logger.info("Indexed %d chunks for course=%s doc=%s", len(chunks), course_id, doc_name)
        return {"indexed": True, "chunk_count": len(chunks)}

    def remove_document(self, course_id: str, doc_name: str) -> bool:
        """Remove a document's chunks from the course vector store."""
        with self._get_meta_lock(course_id):
            meta = self._load_meta(course_id)
            docs_meta = meta.get("documents", {})
            if doc_name not in docs_meta:
                return False

            store = self._get_store(course_id)
            old_ids = docs_meta[doc_name].get("chunk_ids", [])
            if old_ids:
                try:
                    store.delete(ids=old_ids)
                except Exception:
                    logger.warning("Failed to delete chunks by ID for %s/%s", course_id, doc_name)

            # Fallback: also try metadata-based deletion to catch any orphaned chunks
            try:
                store.delete(where={"doc_name": doc_name})
            except Exception:
                logger.warning("Metadata-based chunk cleanup failed for %s/%s", course_id, doc_name)

            del docs_meta[doc_name]
            meta["documents"] = docs_meta
            self._save_meta(course_id, meta)
        invalidate_bm25_cache(course_id)
        from .cache import invalidate_course_cache
        invalidate_course_cache(course_id)
        return True

    def list_indexed_documents(self, course_id: str) -> List[Dict[str, Any]]:
        """List all indexed documents for a course."""
        meta = self._load_meta(course_id)
        return [
            {
                "doc_name": name,
                "chunk_count": info.get("chunk_count", 0),
                "indexed_at": info.get("indexed_at", ""),
                "chapter_id": info.get("chapter_id", ""),
            }
            for name, info in meta.get("documents", {}).items()
        ]

    def assign_document_chapter(self, course_id: str, doc_name: str, chapter_id: str) -> bool:
        """Assign a chapter to an indexed document in course metadata."""
        meta = self._load_meta(course_id)
        docs_meta = meta.get("documents", {})
        if doc_name not in docs_meta:
            return False
        docs_meta[doc_name]["chapter_id"] = str(chapter_id or "")
        docs_meta[doc_name]["updated_at"] = datetime.now(timezone.utc).isoformat()
        meta["documents"] = docs_meta
        self._save_meta(course_id, meta)
        return True

    def get_index_summary(self) -> List[Dict[str, Any]]:
        """Return a summary of all indexed courses with document counts."""
        summary: List[Dict[str, Any]] = []
        if not self.persist_root.exists():
            return summary
        for child in self.persist_root.iterdir():
            if child.is_dir():
                meta = self._load_meta(child.name)
                docs = meta.get("documents", {})
                if docs:
                    total_chunks = sum(d.get("chunk_count", 0) for d in docs.values())
                    summary.append({
                        "course_id": child.name,
                        "doc_count": len(docs),
                        "total_chunks": total_chunks,
                    })
        return summary

    # ------------------------------------------------------------------
    # TF-IDF sparse retrieval for hybrid mode
    # ------------------------------------------------------------------

    def _bm25_retrieve(self, course_id: str, query: str, top_k: int, chapter_id: str = "") -> List[Dict[str, Any]]:
        """BM25 sparse retrieval — delegated to query_handler for cache/index logic."""
        return bm25_retrieve_for_course(
            course_id=course_id,
            query=query,
            top_k=top_k,
            meta=self._load_meta(course_id),
            get_store_fn=self._get_store,
            chapter_id=chapter_id,
        )
    # ------------------------------------------------------------------
    # Public API — Retrieval (called during student chat)
    # ------------------------------------------------------------------

    async def retrieve_for_student(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant chunks across the student's enrolled courses.

        If course_ids is None or empty, returns [] (fail-closed — never search
        all indexed courses to prevent cross-course data leakage).

        When use_hybrid=True, combines vector similarity + TF-IDF sparse retrieval
        using Reciprocal Rank Fusion.

        P0-1/P2-2: retrieval across and within courses is parallelized via ThreadPoolExecutor.
        """
        if not query.strip():
            return []

        if not course_ids:
            logger.debug("No course_ids provided for student %s — fail-closed", student_id)
            return []

        target_courses = course_ids
        normalized_query = normalize_query_for_retrieval(query)

        # Semantic cache lookup (keyed on original query; checked before transforms)
        from .cache import get_cached_results, set_cached_results
        cached = get_cached_results(target_courses, normalized_query)
        if cached is not None:
            logger.debug("Cache hit for query=%s courses=%s", normalized_query[:60], target_courses)
            return cached

        # ── Self-Query: heuristic chapter/doc filter extraction ───────────
        # Collects available chapter_ids and doc_names from indexed course
        # metadata, then tries to detect a chapter reference in the query
        # (e.g. "第三章" → chapter_id matching "3").  Only applied when the
        # caller does not already supply an explicit chapter_id.
        effective_chapter_id = chapter_id
        if not chapter_id and Config.RAG_SELF_QUERY_ENABLED:
            try:
                from .query_transforms import extract_metadata_filters
                avail_chapters: List[str] = []
                avail_docs: List[str] = []
                for cid in target_courses:
                    m = self._load_meta(cid)
                    for dname, dinfo in m.get("documents", {}).items():
                        avail_docs.append(str(dname))
                        ch = str(dinfo.get("chapter_id") or "")
                        if ch and ch not in avail_chapters:
                            avail_chapters.append(ch)
                auto_filters = extract_metadata_filters(
                    query, avail_chapters or None, avail_docs or None
                )
                effective_chapter_id = auto_filters.get("chapter_id", "")
                if effective_chapter_id:
                    logger.debug(
                        "Self-query inferred chapter_id=%s for query=%s",
                        effective_chapter_id, query[:60],
                    )
            except Exception:
                logger.debug("Self-query extraction failed", exc_info=True)

        # ── Query expansion: Multi-Query + HyDE ──────────────────────────
        # Build a list of queries to retrieve for.  RRF will fuse their
        # result lists; the original query is always included first.
        all_queries: List[str] = [normalized_query]

        if Config.RAG_MULTI_QUERY_ENABLED:
            try:
                from .query_transforms import expand_query
                variants = await expand_query(
                    normalized_query, n=Config.RAG_MULTI_QUERY_VARIANTS
                )
                # expand_query returns [original, variant1, variant2, ...]
                for v in variants[1:]:  # skip duplicate of original
                    nv = normalize_query_for_retrieval(v)
                    if nv and nv not in all_queries:
                        all_queries.append(nv)
            except Exception:
                logger.debug("Multi-query expansion failed", exc_info=True)

        if Config.RAG_HYDE_ENABLED:
            try:
                from .query_transforms import generate_hyde_query
                hyde_q = await generate_hyde_query(normalized_query)
                if hyde_q:
                    nh = normalize_query_for_retrieval(hyde_q)
                    if nh not in all_queries:
                        all_queries.append(nh)
            except Exception:
                logger.debug("HyDE query generation failed", exc_info=True)

        # ── P0-1 / P2-2: Parallel retrieval across all courses ───────────
        def _vector_retrieve_one(cid: str, q: str) -> List[Dict[str, Any]]:
            """Vector retrieval for a single (course, query) pair."""
            results: List[Dict[str, Any]] = []
            try:
                course_meta = self._load_meta(cid)
                docs_meta = course_meta.get("documents", {})
                doc_chapter_map = {
                    str(name): str(info.get("chapter_id") or "")
                    for name, info in docs_meta.items()
                }
                store = self._get_store(cid)
                if effective_chapter_id:
                    docs_with_scores = store.similarity_search_with_score(
                        query=q,
                        k=max(1, top_k * 2),
                        filter={"chapter_id": effective_chapter_id},
                    )
                else:
                    docs_with_scores = store.similarity_search_with_score(
                        query=q,
                        k=max(1, top_k * 2),
                    )
                for doc, distance in docs_with_scores:
                    similarity = max(0.0, 1.0 - float(distance))
                    if similarity < Config.RAG_VECTOR_SIMILARITY_THRESHOLD:
                        continue
                    doc_name = (doc.metadata or {}).get("doc_name", "")
                    doc_chapter = (
                        (doc.metadata or {}).get("chapter_id", "")
                        or doc_chapter_map.get(str(doc_name), "")
                    )
                    if effective_chapter_id and str(doc_chapter or "") != effective_chapter_id:
                        continue
                    result_item: Dict[str, Any] = {
                        "course_id": cid,
                        "text": doc.page_content,
                        "score": round(similarity, 4),
                        "raw_vector_score": round(similarity, 4),
                        "doc_name": doc_name,
                        "chapter_id": doc_chapter,
                        "section_title": (doc.metadata or {}).get("section_title", ""),
                        "section_path": (doc.metadata or {}).get("section_path", ""),
                        "page_num": (doc.metadata or {}).get("page_num", -1),
                        "chunk_id": (doc.metadata or {}).get("chunk_id", -1),
                    }
                    # ── Parent-window expansion ──────────────────────
                    if Config.RAG_PARENT_EXPANSION_ENABLED:
                        result_item = expand_chunk_window(
                            result_item, store,
                            window=Config.RAG_PARENT_EXPANSION_WINDOW,
                        )
                    results.append(result_item)
            except BaseException:
                logger.debug("Could not retrieve from course %s", cid, exc_info=True)
            return results

        def _bm25_retrieve_one(cid: str, q: str) -> List[Dict[str, Any]]:
            """BM25 retrieval for a single (course, query) pair."""
            try:
                return self._bm25_retrieve(
                    cid, q, top_k * 2,
                    chapter_id=effective_chapter_id,
                )
            except Exception:
                logger.warning("BM25 retrieval failed for course %s", cid, exc_info=True)
                return []

        # Submit all (course × query) combinations concurrently
        vec_futures_map: Dict[str, Any] = {}
        bm25_futures_map: Dict[str, Any] = {}
        for q in all_queries:
            for cid in target_courses:
                key = f"{cid}::{q}"
                vec_futures_map[key] = _get_retrieval_pool().submit(_vector_retrieve_one, cid, q)
                if use_hybrid:
                    bm25_futures_map[key] = _get_retrieval_pool().submit(_bm25_retrieve_one, cid, q)

        # Collect per-query result lists for RRF
        # Group results: one list per (query) for vector and BM25 separately
        vec_per_query: Dict[str, List[Dict]] = {q: [] for q in all_queries}
        for q in all_queries:
            for cid in target_courses:
                key = f"{cid}::{q}"
                fut = vec_futures_map.get(key)
                if fut is None:
                    continue
                try:
                    vec_per_query[q].extend(fut.result(timeout=10))
                except BaseException:
                    logger.warning("Vector retrieval timed out for course %s query %s", cid, q[:40])

        for q in all_queries:
            vec_per_query[q].sort(key=lambda x: x["score"], reverse=True)

        if not use_hybrid:
            # Vector-only: RRF across query variants, then rerank
            all_vec_lists = list(vec_per_query.values())
            merged = rrf_merge(all_vec_lists, top_k=max(top_k * 3, top_k))
            ranked = rerank_results(query=normalized_query, items=merged, top_k=top_k)
            result = maybe_neural_rerank(normalized_query, ranked, top_k)
            if Config.RAG_LOST_IN_MIDDLE_REORDER:
                result = reorder_for_llm(result)
            set_cached_results(target_courses, normalized_query, result)
            return result

        bm25_per_query: Dict[str, List[Dict]] = {q: [] for q in all_queries}
        for q in all_queries:
            for cid in target_courses:
                key = f"{cid}::{q}"
                fut = bm25_futures_map.get(key)
                if fut is None:
                    continue
                try:
                    bm25_per_query[q].extend(fut.result(timeout=10))
                except BaseException:
                    logger.warning("BM25 retrieval timed out for course %s query %s", cid, q[:40])

        # Build merged result lists: [vec_q1, bm25_q1, vec_q2, bm25_q2, ...]
        all_result_lists: List[List[Dict]] = []
        for q in all_queries:
            if vec_per_query[q]:
                all_result_lists.append(vec_per_query[q])
            if bm25_per_query[q]:
                all_result_lists.append(bm25_per_query[q])

        if not all_result_lists:
            set_cached_results(target_courses, normalized_query, [])
            return []

        # Reciprocal Rank Fusion across all result lists
        merged = rrf_merge(all_result_lists, top_k=max(top_k * 3, top_k))
        ranked = rerank_results(query=normalized_query, items=merged, top_k=top_k)
        result = maybe_neural_rerank(normalized_query, ranked, top_k)

        # ── Lost-in-the-Middle mitigation (Liu et al., 2023) ─────────────
        if Config.RAG_LOST_IN_MIDDLE_REORDER:
            result = reorder_for_llm(result)

        set_cached_results(target_courses, normalized_query, result)
        return result

    def get_indexed_courses_for_student(self, student_id: str) -> List[str]:
        """Return list of course IDs that have indexed materials.

        TODO: filter by student enrollment once enrollment data is available.
        """
        return self._get_all_indexed_courses()

    def _get_all_indexed_courses(self) -> List[str]:
        """Return all course IDs that have at least one indexed document."""
        courses = []
        if not self.persist_root.exists():
            return courses
        for child in self.persist_root.iterdir():
            if child.is_dir():
                meta = self._load_meta(child.name)
                if meta.get("documents"):
                    courses.append(child.name)
        return courses


def shutdown_retrieval_pool() -> None:
    """Gracefully shut down the module-level retrieval thread pool."""
    global _retrieval_pool
    if _retrieval_pool is not None:
        _retrieval_pool.shutdown(wait=True, cancel_futures=True)
        _retrieval_pool = None


# ---------------------------------------------------------------------------
course_rag_service = CourseRagService()
