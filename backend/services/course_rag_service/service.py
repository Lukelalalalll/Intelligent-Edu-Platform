"""CourseRagService facade for per-course vector store management."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.config import Config

from .embedding_provider import CourseRagEmbeddingProvider
from .indexing_service import CourseRagIndexingService
from .query_handler import invalidate_bm25_cache
from .retrieval_service import CourseRagRetrievalService, shutdown_retrieval_pool
from .store_manager import CourseRagStoreManager

if TYPE_CHECKING:
    from langchain_huggingface import HuggingFaceEmbeddings


class CourseRagService:
    """Backward-compatible facade over the progressively extracted RAG services."""

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
        self._embedding_provider = CourseRagEmbeddingProvider(self.embedding_model_name)
        self._store_manager = CourseRagStoreManager(
            persist_root=self.persist_root,
            embedding_provider=self._embedding_provider,
        )
        self._indexing_service = CourseRagIndexingService(
            store_manager=self._store_manager,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )
        self._retrieval_service = CourseRagRetrievalService(store_manager=self._store_manager)

    @property
    def embeddings(self) -> "HuggingFaceEmbeddings":
        return self._embedding_provider.embeddings

    def _course_dir(self, course_id: str) -> Path:
        return self._store_manager.course_dir(course_id)

    def _meta_path(self, course_id: str) -> Path:
        return self._store_manager.meta_path(course_id)

    def _get_meta_lock(self, course_id: str) -> threading.Lock:
        return self._store_manager.get_meta_lock(course_id)

    def _load_meta(self, course_id: str) -> Dict[str, Any]:
        return self._store_manager.load_meta(course_id)

    def _save_meta(self, course_id: str, payload: Dict[str, Any]) -> None:
        self._store_manager.save_meta(course_id, payload)

    def _get_store(self, course_id: str) -> Any:
        return self._store_manager.get_store(course_id)

    def index_document(
        self,
        course_id: str,
        doc_name: str,
        document_text: str,
        chapter_id: str = "",
        progress_callback=None,
        **kwargs,
    ) -> Dict[str, Any]:
        return self._indexing_service.index_document(
            course_id=course_id,
            doc_name=doc_name,
            document_text=document_text,
            chapter_id=chapter_id,
            progress_callback=progress_callback,
            **kwargs,
        )

    def create_index_version(self, course_id: str) -> str:
        return self._indexing_service.create_index_version(course_id)

    def finalize_index_build(self, course_id: str, index_version: str, *, activate: bool = True) -> Dict[str, Any]:
        return self._indexing_service.finalize_index_build(course_id, index_version, activate=activate)

    def mark_index_build_failed(self, course_id: str, index_version: str, error: str) -> None:
        self._indexing_service.mark_index_build_failed(course_id, index_version, error)

    def remove_document(self, course_id: str, doc_name: str) -> bool:
        return self._indexing_service.remove_document(course_id, doc_name)

    def list_indexed_documents(self, course_id: str) -> List[Dict[str, Any]]:
        return self._indexing_service.list_indexed_documents(course_id)

    def get_document_diagnostics(self, course_id: str, doc_name: str) -> Dict[str, Any]:
        return self._indexing_service.get_document_diagnostics(course_id, doc_name)

    def active_index_version(self, course_id: str) -> str:
        return self._indexing_service.active_index_version(course_id)

    def assign_document_chapter(self, course_id: str, doc_name: str, chapter_id: str) -> bool:
        return self._indexing_service.assign_document_chapter(course_id, doc_name, chapter_id)

    def get_index_summary(self) -> List[Dict[str, Any]]:
        return self._indexing_service.get_index_summary()

    async def retrieve_for_student(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
        debug: bool = False,
        rag_profile: str = "",
        debug_retrieval: bool = False,
        allow_web_correction: bool = False,
        force_query_class: str = "",
    ) -> List[Dict[str, Any]]:
        return await self._retrieval_service.retrieve_for_student(
            student_id=student_id,
            query=query,
            top_k=top_k,
            course_ids=course_ids,
            use_hybrid=use_hybrid,
            chapter_id=chapter_id,
            debug=debug,
            rag_profile=rag_profile,
            debug_retrieval=debug_retrieval,
            allow_web_correction=allow_web_correction,
            force_query_class=force_query_class,
        )

    async def retrieve_for_student_detailed(
        self,
        student_id: str,
        query: str,
        top_k: int = 4,
        course_ids: Optional[List[str]] = None,
        use_hybrid: bool = True,
        chapter_id: str = "",
        debug: bool = False,
        rag_profile: str = "",
        debug_retrieval: bool = False,
        allow_web_correction: bool = False,
        force_query_class: str = "",
    ) -> Any:
        return await self._retrieval_service.retrieve_for_student_detailed(
            student_id=student_id,
            query=query,
            top_k=top_k,
            course_ids=course_ids,
            use_hybrid=use_hybrid,
            chapter_id=chapter_id,
            debug=debug,
            rag_profile=rag_profile,
            debug_retrieval=debug_retrieval,
            allow_web_correction=allow_web_correction,
            force_query_class=force_query_class,
        )

    def get_indexed_courses_for_student(self, student_id: str) -> List[str]:
        return self._retrieval_service.get_indexed_courses_for_student(student_id)

    def _get_all_indexed_courses(self) -> List[str]:
        return self._store_manager.get_all_indexed_courses()


course_rag_service = CourseRagService()
