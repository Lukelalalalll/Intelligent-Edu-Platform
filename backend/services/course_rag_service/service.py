"""CourseRagService — per-course vector store management for student RAG retrieval.

Uses ChromaDB + sentence-transformers to index course materials uploaded by
teachers and retrieve relevant chunks when students ask questions in AIInteract.
"""
from __future__ import annotations

import json
import logging
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
from .retrieval_helpers import doc_hash, rerank_results, rrf_merge

logger = logging.getLogger(__name__)


class CourseRagService:
    """Manages per-course vector stores for student RAG retrieval."""

    def __init__(
        self,
        persist_root: str | None = None,
        embedding_model_name: str | None = None,
        chunk_size: int = 800,
        chunk_overlap: int = 120,
    ):
        self.persist_root = Path(persist_root or Config.RAG_VECTORSTORE_DIR) / "courses"
        self.persist_root.mkdir(parents=True, exist_ok=True)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_model_name = embedding_model_name or Config.RAG_EMBEDDING_MODEL
        self._embeddings: Optional[HuggingFaceEmbeddings] = None

    @property
    def embeddings(self) -> HuggingFaceEmbeddings:
        if self._embeddings is None:
            self._embeddings = HuggingFaceEmbeddings(model_name=self.embedding_model_name)
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

    def _get_store(self, course_id: str) -> Chroma:
        return Chroma(
            collection_name=f"course_{course_id}",
            embedding_function=self.embeddings,
            persist_directory=str(self._course_dir(course_id)),
        )

    # ------------------------------------------------------------------
    # Public API — Indexing (called by teachers)
    # ------------------------------------------------------------------

    def index_document(
        self,
        course_id: str,
        doc_name: str,
        document_text: str,
        chapter_id: str = "",
    ) -> Dict[str, Any]:
        """Index a single document into a course's vector store.

        Idempotent: re-indexing the same doc with the same content is a no-op.
        """
        if not document_text.strip():
            return {"indexed": False, "reason": "empty document"}

        meta = self._load_meta(course_id)
        docs_meta = meta.get("documents", {})
        current_hash = doc_hash(document_text)

        if docs_meta.get(doc_name, {}).get("hash") == current_hash:
            return {"indexed": False, "reason": "unchanged", "chunk_count": docs_meta[doc_name].get("chunk_count", 0)}

        store = self._get_store(course_id)

        # Remove old chunks for this document
        old_ids = docs_meta.get(doc_name, {}).get("chunk_ids", [])
        if old_ids:
            try:
                store.delete(ids=old_ids)
            except Exception:
                logger.debug("Could not delete old chunks for %s/%s", course_id, doc_name)

        # Chunk and index
        chunks = build_structured_chunks(document_text, self.chunk_size, self.chunk_overlap)
        if not chunks:
            return {"indexed": False, "reason": "no chunks produced"}

        ids = [f"{course_id}_{doc_name}_{i}" for i in range(len(chunks))]
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
        store.add_texts(texts=[c["text"] for c in chunks], ids=ids, metadatas=metadatas)

        # Update meta
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

        logger.info("Indexed %d chunks for course=%s doc=%s", len(chunks), course_id, doc_name)
        return {"indexed": True, "chunk_count": len(chunks)}

    def remove_document(self, course_id: str, doc_name: str) -> bool:
        """Remove a document's chunks from the course vector store."""
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
                pass

        del docs_meta[doc_name]
        meta["documents"] = docs_meta
        self._save_meta(course_id, meta)
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

    def _tfidf_retrieve(self, course_id: str, query: str, top_k: int, chapter_id: str = "") -> List[Dict[str, Any]]:
        """Simple TF-IDF retrieval over indexed chunks for a course."""
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        meta = self._load_meta(course_id)
        docs_meta = meta.get("documents", {})
        if not docs_meta:
            return []

        doc_chapter_map = {
            str(name): str(info.get("chapter_id") or "")
            for name, info in docs_meta.items()
        }

        # Reconstruct all chunks with metadata
        all_chunks: List[Dict[str, Any]] = []
        store = self._get_store(course_id)
        try:
            collection = store._collection
            data = collection.get(include=["documents", "metadatas"])
            if data and data.get("documents"):
                for i, text in enumerate(data["documents"]):
                    md = data["metadatas"][i] if data.get("metadatas") else {}
                    all_chunks.append({
                        "text": text,
                        "doc_name": (md or {}).get("doc_name", ""),
                        "chapter_id": (md or {}).get("chapter_id", "") or doc_chapter_map.get(str((md or {}).get("doc_name", "")), ""),
                        "course_id": course_id,
                        "section_title": (md or {}).get("section_title", ""),
                        "section_path": (md or {}).get("section_path", ""),
                        "chunk_id": (md or {}).get("chunk_id", i),
                        "page_num": (md or {}).get("page_num", -1),
                    })
        except Exception:
            return []

        if not all_chunks:
            return []

        corpus = [c["text"] for c in all_chunks]
        try:
            vectorizer = TfidfVectorizer(max_features=5000, stop_words="english")
            tfidf_matrix = vectorizer.fit_transform(corpus + [query])
            query_vec = tfidf_matrix[-1]
            similarities = cosine_similarity(query_vec, tfidf_matrix[:-1]).flatten()
        except Exception:
            return []

        top_indices = np.argsort(similarities)[::-1][:top_k]
        results = []
        for idx in top_indices:
            score = float(similarities[idx])
            if score < 0.01:
                continue
            c = all_chunks[idx]
            if chapter_id and str(c.get("chapter_id") or "") != chapter_id:
                continue
            results.append({
                "course_id": c["course_id"],
                "text": c["text"],
                "score": round(score, 4),
                "doc_name": c["doc_name"],
                "chapter_id": c.get("chapter_id", ""),
                "section_title": c.get("section_title", ""),
                "section_path": c.get("section_path", ""),
                "chunk_id": c.get("chunk_id", -1),
                "page_num": c.get("page_num", -1),
            })
        return results

    # ------------------------------------------------------------------
    # Public API — Retrieval (called during student chat)
    # ------------------------------------------------------------------

    def retrieve_for_student(
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
        """
        if not query.strip():
            return []

        if not course_ids:
            logger.debug("No course_ids provided for student %s — fail-closed", student_id)
            return []

        target_courses = course_ids

        # Vector retrieval results
        vector_results: List[Dict[str, Any]] = []
        for cid in target_courses:
            try:
                course_meta = self._load_meta(cid)
                docs_meta = course_meta.get("documents", {})
                doc_chapter_map = {
                    str(name): str(info.get("chapter_id") or "")
                    for name, info in docs_meta.items()
                }
                store = self._get_store(cid)
                if chapter_id:
                    docs_with_scores = store.similarity_search_with_score(
                        query=query,
                        k=max(1, top_k * 2),
                        filter={"chapter_id": chapter_id},
                    )
                else:
                    docs_with_scores = store.similarity_search_with_score(
                        query=query,
                        k=max(1, top_k * 2),
                    )
                for doc, distance in docs_with_scores:
                    similarity = 1.0 / (1.0 + float(distance))
                    if similarity < 0.15:
                        continue
                    doc_name = (doc.metadata or {}).get("doc_name", "")
                    doc_chapter = (doc.metadata or {}).get("chapter_id", "") or doc_chapter_map.get(str(doc_name), "")
                    if chapter_id and str(doc_chapter or "") != chapter_id:
                        continue
                    vector_results.append({
                        "course_id": cid,
                        "text": doc.page_content,
                        "score": round(similarity, 4),
                        "doc_name": doc_name,
                        "chapter_id": doc_chapter,
                    })
            except Exception:
                logger.debug("Could not retrieve from course %s", cid, exc_info=True)

        vector_results.sort(key=lambda x: x["score"], reverse=True)

        if not use_hybrid:
            return rerank_results(query=query, items=vector_results, top_k=top_k)

        # TF-IDF sparse retrieval for hybrid fusion
        sparse_results: List[Dict[str, Any]] = []
        for cid in target_courses:
            try:
                sparse_results.extend(self._tfidf_retrieve(cid, query, top_k * 2, chapter_id=chapter_id))
            except Exception:
                logger.debug("TF-IDF retrieval failed for course %s", cid, exc_info=True)

        if not sparse_results:
            return rerank_results(query=query, items=vector_results, top_k=top_k)

        # Reciprocal Rank Fusion
        merged = rrf_merge([vector_results, sparse_results], top_k=max(top_k * 2, top_k))
        return rerank_results(query=query, items=merged, top_k=top_k)

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


# ---------------------------------------------------------------------------
# Module-level singleton (lazy-loaded embeddings)
# ---------------------------------------------------------------------------
course_rag_service = CourseRagService()
