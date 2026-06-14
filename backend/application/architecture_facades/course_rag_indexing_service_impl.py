"""Indexing workflows for course RAG."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.config import Config
from backend.core.opensearch_client import opensearch_enabled

from backend.services.course_rag_service.chunking import build_structured_chunks
from backend.services.course_rag_service.opensearch_sparse_retriever import sync_course_sparse_index
from backend.services.course_rag_service.document_processor import detect_content_density
from backend.services.course_rag_service.query_handler import invalidate_bm25_cache
from backend.services.course_rag_service.retrieval_helpers import doc_hash
from backend.services.course_rag_service.store_manager import CourseRagStoreManager

logger = logging.getLogger(__name__)


def _invalidate_course_cache(course_id: str) -> None:
    from backend.services.course_rag_service.cache import invalidate_course_cache

    invalidate_course_cache(course_id)


class CourseRagIndexingService:
    """Owns document indexing and index metadata mutations."""

    def __init__(self, *, store_manager: CourseRagStoreManager, chunk_size: int, chunk_overlap: int):
        self._store_manager = store_manager
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def create_index_version(self, course_id: str) -> str:
        with self._store_manager.get_meta_lock(course_id):
            index_version, _version_meta = self._store_manager.begin_index_version(course_id)
        return index_version

    def mark_index_build_failed(self, course_id: str, index_version: str, error: str) -> None:
        with self._store_manager.get_meta_lock(course_id):
            self._store_manager.mark_index_version_failed(course_id, index_version, error=error)

    def index_document(
        self,
        course_id: str,
        doc_name: str,
        document_text: str,
        chapter_id: str = "",
        progress_callback=None,
        *,
        index_version: str | None = None,
        source_hash: str = "",
        normalized_hash: str = "",
        parser_used: str = "",
        parser_strategy: str = "",
        quality_report: dict[str, Any] | None = None,
        structure: dict[str, Any] | None = None,
        artifact_refs: list[dict[str, Any]] | None = None,
        page_count: int | None = None,
    ) -> Dict[str, Any]:
        """Index a single document into a course's versioned vector store."""
        if not document_text.strip():
            return {"indexed": False, "reason": "empty document"}

        build_version = str(index_version or self._store_manager.active_index_version(course_id))
        logger.debug(
            "index_document: START course=%s version=%s doc=%s text_len=%d",
            course_id,
            build_version,
            doc_name,
            len(document_text),
        )

        chunk_size = self.chunk_size
        chunk_overlap = self.chunk_overlap
        if detect_content_density(document_text) == "math_heavy":
            chunk_size = max(chunk_size, 1600)
            chunk_overlap = max(chunk_overlap, 300)

        current_hash = normalized_hash or doc_hash(document_text)
        chunks = build_structured_chunks(
            document_text,
            chunk_size,
            chunk_overlap,
            source_hash=source_hash or current_hash,
            structure=structure,
            parser_used=parser_used,
        )
        if not chunks:
            return {"indexed": False, "reason": "no chunks produced"}

        if Config.RAG_CONTEXTUAL_RETRIEVAL_ENABLED:
            try:
                from backend.services.course_rag_service.contextual import add_chunk_context

                chunks = add_chunk_context(chunks, document_text)
                logger.info(
                    "Contextual retrieval: contextualized %d chunks for %s/%s",
                    len(chunks),
                    course_id,
                    doc_name,
                )
            except Exception:
                logger.warning(
                    "Contextual retrieval failed for %s/%s - using plain chunks",
                    course_id,
                    doc_name,
                    exc_info=True,
                )

        ids = [str(chunk["stable_id"]) for chunk in chunks]
        metadatas = []
        all_texts = []
        node_counts: dict[str, int] = {}
        for i, chunk in enumerate(chunks):
            node_type = str(chunk.get("node_type") or "leaf_chunk")
            node_counts[node_type] = node_counts.get(node_type, 0) + 1
            metadatas.append(
                {
                    "course_id": course_id,
                    "doc_name": doc_name,
                    "chapter_id": str(chapter_id or ""),
                    "chunk_id": i,
                    "chunk_stable_id": str(chunk.get("stable_id") or ids[i]),
                    "node_type": node_type,
                    "section_title": chunk.get("section_title", "Document"),
                    "section_path": chunk.get("section_path", "Document"),
                    "heading_path": chunk.get("section_path", "Document"),
                    "heading_level": int(chunk.get("heading_level", 0) or 0),
                    "page_num": int(chunk.get("page_num", -1) or -1),
                    "page_start": int(chunk.get("page_start", -1) or -1),
                    "page_end": int(chunk.get("page_end", -1) or -1),
                    "char_start": int(chunk.get("char_start", 0) or 0),
                    "char_end": int(chunk.get("char_end", 0) or 0),
                    "chunk_chars": len(chunk.get("text", "")),
                    "token_count": int(chunk.get("token_count", 0) or 0),
                    "section_ordinal": int(chunk.get("section_ordinal", 0) or 0),
                    "section_local_ordinal": int(chunk.get("section_local_ordinal", 0) or 0),
                    "element_type": str(chunk.get("element_type") or "paragraph"),
                    "parser_used": str(parser_used or chunk.get("parser_used") or ""),
                    "index_version": build_version,
                }
            )
            all_texts.append(chunk["text"])

        batch_size = 32
        total = len(all_texts)
        store = self._store_manager.get_store(course_id, build_version)
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

        with self._store_manager.get_meta_lock(course_id):
            meta = self._store_manager.load_meta(course_id)
            version_meta = dict((meta.get("index_versions") or {}).get(build_version) or {})
            docs_meta = dict(version_meta.get("documents") or {})
            docs_meta[doc_name] = {
                "hash": current_hash,
                "source_hash": source_hash or current_hash,
                "normalized_hash": current_hash,
                "chunk_count": len(chunks),
                "chunk_ids": ids,
                "chapter_id": str(chapter_id or ""),
                "structured_chunking": True,
                "indexed_at": datetime.now(timezone.utc).isoformat(),
                "schema_version": int(getattr(Config, "RAG_INDEX_SCHEMA_VERSION", 2) or 2),
                "index_version": build_version,
                "parser_used": str(parser_used or ""),
                "parser_strategy": str(parser_strategy or ""),
                "quality_report": quality_report or {},
                "artifact_refs": artifact_refs or [],
                "build_status": "indexed",
                "page_count": int(page_count or (quality_report or {}).get("page_count") or 1),
                "node_counts": node_counts,
            }
            version_meta["documents"] = docs_meta
            version_meta["updated_at"] = datetime.now(timezone.utc).isoformat()
            version_meta["build_status"] = "building"
            version_meta["schema_version"] = int(getattr(Config, "RAG_INDEX_SCHEMA_VERSION", 2) or 2)
            meta.setdefault("index_versions", {})[build_version] = version_meta
            self._store_manager.save_meta(course_id, meta)

        logger.info(
            "Indexed %d nodes for course=%s version=%s doc=%s",
            len(chunks),
            course_id,
            build_version,
            doc_name,
        )
        return {
            "indexed": True,
            "chunk_count": len(chunks),
            "node_counts": node_counts,
            "index_version": build_version,
            "schema_version": int(getattr(Config, "RAG_INDEX_SCHEMA_VERSION", 2) or 2),
        }

    def finalize_index_build(
        self,
        course_id: str,
        index_version: str,
        *,
        activate: bool = True,
    ) -> dict[str, Any]:
        with self._store_manager.get_meta_lock(course_id):
            meta = self._store_manager.load_meta(course_id)
            version_meta = dict((meta.get("index_versions") or {}).get(index_version) or {})
            documents = dict(version_meta.get("documents") or {})
            total_nodes = sum(int(doc.get("chunk_count", 0) or 0) for doc in documents.values())
            build_status = "active" if activate else "ready"
            finalized = self._store_manager.finalize_index_version(
                course_id,
                index_version,
                documents=documents,
                total_nodes=total_nodes,
                build_status=build_status,
                metadata={"activated_at": datetime.now(timezone.utc).isoformat() if activate else ""},
            )
            if activate:
                self._store_manager.activate_index_version(course_id, index_version)

        if activate:
            self._sync_opensearch_active_version(course_id, index_version)

        invalidate_bm25_cache(course_id)
        _invalidate_course_cache(course_id)
        return finalized

    def remove_document(self, course_id: str, doc_name: str) -> bool:
        """Remove a document's nodes from the active course vector store."""
        build_version = self._store_manager.active_index_version(course_id)
        with self._store_manager.get_meta_lock(course_id):
            meta = self._store_manager.load_meta(course_id)
            version_meta = dict((meta.get("index_versions") or {}).get(build_version) or {})
            docs_meta = dict(version_meta.get("documents") or {})
            if doc_name not in docs_meta:
                return False

            store = self._store_manager.get_store(course_id, build_version)
            old_ids = docs_meta[doc_name].get("chunk_ids", [])
            if old_ids:
                try:
                    store.delete(ids=old_ids)
                except Exception:
                    logger.warning("Failed to delete nodes by ID for %s/%s", course_id, doc_name)

            try:
                store.delete(where={"doc_name": doc_name})
            except Exception:
                logger.warning("Metadata-based node cleanup failed for %s/%s", course_id, doc_name)

            del docs_meta[doc_name]
            version_meta["documents"] = docs_meta
            version_meta["doc_count"] = len(docs_meta)
            version_meta["total_nodes"] = sum(int(doc.get("chunk_count", 0) or 0) for doc in docs_meta.values())
            version_meta["updated_at"] = datetime.now(timezone.utc).isoformat()
            meta.setdefault("index_versions", {})[build_version] = version_meta
            self._store_manager.save_meta(course_id, meta)

        invalidate_bm25_cache(course_id)
        _invalidate_course_cache(course_id)
        self._sync_opensearch_active_version(course_id, build_version)
        return True

    def list_indexed_documents(self, course_id: str) -> List[Dict[str, Any]]:
        active_version = self._store_manager.active_index_version(course_id)
        docs_meta = self._store_manager.documents_meta(course_id, active_version)
        return [
            {
                "doc_name": name,
                "chunk_count": info.get("chunk_count", 0),
                "indexed_at": info.get("indexed_at", ""),
                "chapter_id": info.get("chapter_id", ""),
                "parser_used": info.get("parser_used", ""),
                "page_count": info.get("page_count", 1),
                "node_counts": info.get("node_counts", {}),
                "quality_status": (info.get("quality_report") or {}).get("quality_status", "ok"),
                "index_version": info.get("index_version", active_version),
            }
            for name, info in docs_meta.items()
        ]

    def get_document_diagnostics(self, course_id: str, doc_name: str) -> dict[str, Any]:
        return self._store_manager.read_diagnostics(course_id, doc_name)

    def assign_document_chapter(self, course_id: str, doc_name: str, chapter_id: str) -> bool:
        build_version = self._store_manager.active_index_version(course_id)
        meta = self._store_manager.load_meta(course_id)
        version_meta = dict((meta.get("index_versions") or {}).get(build_version) or {})
        docs_meta = dict(version_meta.get("documents") or {})
        if doc_name not in docs_meta:
            return False
        docs_meta[doc_name]["chapter_id"] = str(chapter_id or "")
        docs_meta[doc_name]["updated_at"] = datetime.now(timezone.utc).isoformat()
        version_meta["documents"] = docs_meta
        meta.setdefault("index_versions", {})[build_version] = version_meta
        self._store_manager.save_meta(course_id, meta)
        self._sync_opensearch_active_version(course_id, build_version)
        return True

    def get_index_summary(self) -> List[Dict[str, Any]]:
        return self._store_manager.get_index_summary()

    def active_index_version(self, course_id: str) -> str:
        return self._store_manager.active_index_version(course_id)

    def _sync_opensearch_active_version(self, course_id: str, index_version: str) -> None:
        if not opensearch_enabled(Config):
            return
        docs_meta = self._store_manager.documents_meta(course_id, index_version)
        if not docs_meta:
            sync_course_sparse_index(course_id, [])
            return

        store = self._store_manager.get_store(course_id, index_version)
        payload: list[dict[str, Any]] = []
        for doc_name, info in docs_meta.items():
            chunk_ids = list(info.get("chunk_ids") or [])
            if not chunk_ids:
                continue
            try:
                data = store.get(ids=chunk_ids, include=["documents", "metadatas"])
            except Exception:
                logger.warning(
                    "OpenSearch sparse sync could not read nodes for course=%s doc=%s",
                    course_id,
                    doc_name,
                    exc_info=True,
                )
                continue

            ids = list(data.get("ids") or [])
            docs = list(data.get("documents") or [])
            metas = list(data.get("metadatas") or [])
            for chunk_id, text, metadata in zip(ids, docs, metas):
                normalized_metadata = dict(metadata or {})
                normalized_metadata["chapter_id"] = str(info.get("chapter_id") or normalized_metadata.get("chapter_id") or "")
                normalized_metadata["doc_name"] = str(doc_name)
                payload.append(
                    {
                        "id": str(normalized_metadata.get("chunk_stable_id") or chunk_id),
                        "text": str(text or ""),
                        "contextualized_text": str(text or ""),
                        "metadata": normalized_metadata,
                    }
                )

        synced = sync_course_sparse_index(course_id, payload)
        if not synced:
            logger.warning("OpenSearch sparse sync skipped or failed for course=%s version=%s", course_id, index_version)
