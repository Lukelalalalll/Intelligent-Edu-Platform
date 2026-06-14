from __future__ import annotations

import sys
from types import ModuleType
from types import SimpleNamespace


def _install_stub_module(name: str, **attrs):
    module = ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


if "langchain_text_splitters" not in sys.modules:
    class _StubRecursiveCharacterTextSplitter:
        def __init__(self, chunk_size: int, chunk_overlap: int, separators=None):
            self.chunk_size = chunk_size
            self.chunk_overlap = chunk_overlap

        def split_text(self, text: str):
            text = str(text or "")
            if not text.strip():
                return []
            step = max(1, self.chunk_size - self.chunk_overlap)
            chunks = []
            start = 0
            while start < len(text):
                end = min(len(text), start + self.chunk_size)
                chunk = text[start:end].strip()
                if chunk:
                    chunks.append(chunk)
                if end >= len(text):
                    break
                start += step
            return chunks

    sys.modules["langchain_text_splitters"] = SimpleNamespace(
        RecursiveCharacterTextSplitter=_StubRecursiveCharacterTextSplitter
    )

if "langchain_chroma" not in sys.modules:
    class _StubChroma:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

    sys.modules["langchain_chroma"] = SimpleNamespace(Chroma=_StubChroma)

if "backend.config" not in sys.modules:
    _install_stub_module(
        "backend.config",
        Config=SimpleNamespace(
            RAG_INDEX_SCHEMA_VERSION=2,
            RAG_CONTEXTUAL_RETRIEVAL_ENABLED=False,
            RAG_NEURAL_RERANK_ENABLED=False,
            RAG_NEURAL_RERANK_CANDIDATES=10,
            RAG_CHUNK_SIZE=800,
            RAG_CHUNK_OVERLAP=120,
            KNOWLEDGE_BASE_UPLOAD_DIR="uploads/knowledge_base",
            BASE_DIR=".",
        ),
    )

if "backend.core.database" not in sys.modules:
    _install_stub_module("backend.core.database", db={})

if "backend.repositories" not in sys.modules:
    _install_stub_module("backend.repositories", indexing_job_repo=SimpleNamespace())

if "backend.services.background_job_dispatcher" not in sys.modules:
    _install_stub_module(
        "backend.services.background_job_dispatcher",
        background_job_dispatcher=SimpleNamespace(),
    )

if "backend.services.background_job_runtime" not in sys.modules:
    _install_stub_module(
        "backend.services.background_job_runtime",
        spawn_background_coro=lambda *args, **kwargs: None,
    )

if "backend.services.file_asset_service" not in sys.modules:
    async def _register_file_asset_stub(*args, **kwargs):
        return {}

    _install_stub_module(
        "backend.services.file_asset_service",
        register_file_asset=_register_file_asset_stub,
    )

if "backend.services.course_rag_service.embedding_provider" not in sys.modules:
    class _StubCourseRagEmbeddingProvider:
        def __init__(self, model_name: str | None = None):
            self.model_name = model_name
            self.embeddings = None

    _install_stub_module(
        "backend.services.course_rag_service.embedding_provider",
        CourseRagEmbeddingProvider=_StubCourseRagEmbeddingProvider,
    )

from backend.services import indexing_job_extractors
from backend.services.course_rag_service.chunking import build_structured_chunks
from backend.services.course_rag_service.indexing_service import CourseRagIndexingService
from backend.services.course_rag_service.query_handler import bm25_retrieve_for_course
from backend.services.course_rag_service.store_manager import CourseRagStoreManager
from backend.services.indexing_job_extractors import ParsedDocumentResult, extract_document_payload
from backend.services.indexing_job_service import _reuse_existing_index


class _FakeEmbeddingProvider:
    embeddings = None


class _FakeVectorStore:
    def __init__(self, *, payload: dict | None = None):
        self.payload = payload or {}
        self.add_calls: list[dict] = []
        self.get_calls: list[dict] = []
        self._collection = self

    def get(self, **kwargs):
        self.get_calls.append(kwargs)
        return self.payload

    def add_texts(self, *, texts, ids, metadatas):
        self.add_calls.append(
            {
                "texts": list(texts),
                "ids": list(ids),
                "metadatas": [dict(item) for item in metadatas],
            }
        )

    def count(self):
        return len(self.payload.get("ids") or [])


class _FakeReuseStoreManager:
    def __init__(self):
        self.source_store = _FakeVectorStore(
            payload={
                "ids": ["source-node-1"],
                "documents": ["Normalized shared chunk"],
                "metadatas": [
                    {
                        "doc_name": "existing.pdf",
                        "chunk_stable_id": "stable-node-1",
                        "chapter_id": "chapter-a",
                        "index_version": "v1",
                        "node_type": "leaf_chunk",
                    }
                ],
            }
        )
        self.target_store = _FakeVectorStore()
        self.clone_call: dict | None = None
        self.diagnostics_call: dict | None = None

    def documents_meta(self, course_id: str, index_version: str):
        return {
            "existing.pdf": {
                "chunk_ids": ["source-node-1"],
                "chunk_count": 1,
                "page_count": 4,
            }
        }

    def get_store(self, course_id: str, index_version: str):
        return self.source_store if index_version == "v1" else self.target_store

    def clone_document_metadata(
        self,
        course_id: str,
        *,
        from_doc_name: str,
        to_doc_name: str,
        index_version: str,
        overrides: dict | None = None,
    ):
        self.clone_call = {
            "course_id": course_id,
            "from_doc_name": from_doc_name,
            "to_doc_name": to_doc_name,
            "index_version": index_version,
            "overrides": dict(overrides or {}),
        }
        cloned = {
            "chunk_count": 1,
            "chunk_ids": ["stable-node-1:new.pdf"],
            "page_count": 4,
        }
        cloned.update(overrides or {})
        return cloned

    def write_diagnostics(self, course_id: str, doc_name: str, payload: dict):
        self.diagnostics_call = {
            "course_id": course_id,
            "doc_name": doc_name,
            "payload": dict(payload),
        }


def test_extract_document_payload_falls_back_from_docling_to_fast(monkeypatch, tmp_path):
    source = tmp_path / "lesson.md"
    source.write_text("# Placeholder\n\nIgnored source", encoding="utf-8")

    monkeypatch.setattr(
        indexing_job_extractors,
        "_extract_with_docling",
        lambda _path: {"markdown": "bad"},
    )
    monkeypatch.setattr(
        indexing_job_extractors,
        "_extract_fast_text",
        lambda _path: (
            "# Lesson 1\n\n"
            "Reliable fallback content for indexing and diagnostics across multi-section course notes. "
            "This paragraph is intentionally long enough to clear the quality gate thresholds.\n\n"
            "- gradient descent\n"
        ),
    )

    result = extract_document_payload(source, parser_strategy="auto", index_profile="quality")

    assert result.parser_used == "fast"
    assert result.fallback_chain == ["docling"]
    assert result.quality_report["quality_status"] == "ok"
    assert {artifact.kind for artifact in result.artifacts} == {
        "normalized_markdown",
        "quality_report_json",
        "structure_json",
    }


def test_extract_document_payload_fast_auto_skips_docling(monkeypatch, tmp_path):
    source = tmp_path / "lesson.pdf"
    source.write_bytes(b"%PDF-1.4\n")

    def fail_docling(_path):
        raise AssertionError("docling should be skipped when fast extraction is requested")

    monkeypatch.setattr(indexing_job_extractors, "_extract_with_docling", fail_docling)
    monkeypatch.setattr(
        indexing_job_extractors,
        "_extract_pdf_markdown",
        lambda _path, *, use_fast: (
            "# Fast Lesson\n\n"
            "Fast parser content is long enough to be indexed reliably without invoking docling. "
            "This verifies that the fast option is respected by the auto strategy."
        ) if use_fast else "",
    )

    result = extract_document_payload(source, parser_strategy="auto", index_profile="quality", use_fast=True)

    assert result.parser_used == "fast"
    assert result.fallback_chain == []


def test_build_structured_chunks_preserves_paragraphs_and_tables():
    text = "\n".join(
        [
            "# Transport",
            "",
            "Congestion control keeps packet loss manageable during network bursts.",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            "| RTT | 30ms |",
        ]
    )
    structure = {
        "blocks": [
            {
                "element_type": "paragraph",
                "heading_path": "Transport",
                "page_start": 1,
                "page_end": 1,
                "text": "Congestion control keeps packet loss manageable during network bursts.",
            },
            {
                "element_type": "table",
                "heading_path": "Transport",
                "page_start": 1,
                "page_end": 1,
                "text": "| Metric | Value |\n| --- | --- |\n| RTT | 30ms |",
            },
        ]
    }

    chunks = build_structured_chunks(
        text,
        chunk_size=120,
        chunk_overlap=20,
        source_hash="source-hash",
        structure=structure,
        parser_used="docling",
    )

    assert any(chunk["node_type"] == "section_summary" for chunk in chunks)
    assert any(
        chunk["element_type"] == "paragraph"
        and "Congestion control keeps packet loss manageable" in chunk["text"]
        for chunk in chunks
    )
    assert any(
        chunk["node_type"] == "table_chunk"
        and "| Metric | Value |" in chunk["text"]
        for chunk in chunks
    )
    assert not any(
        chunk["node_type"] == "leaf_chunk"
        and "Congestion control keeps packet loss manageable" in chunk["text"]
        and "| Metric | Value |" in chunk["text"]
        for chunk in chunks
    )


def test_store_manager_normalizes_legacy_documents_and_mirrors_active_version(tmp_path):
    manager = CourseRagStoreManager(
        persist_root=tmp_path,
        embedding_provider=_FakeEmbeddingProvider(),
    )

    normalized = manager._normalize_meta(
        {
            "updated_at": "2026-06-13T00:00:00+00:00",
            "documents": {
                "lesson-a.pdf": {"chunk_count": 3},
                "lesson-b.pdf": {"chunk_count": 5},
            },
        }
    )

    assert normalized["active_index_version"] == "v1"
    assert normalized["index_versions"]["v1"]["doc_count"] == 2
    assert normalized["index_versions"]["v1"]["total_nodes"] == 8
    assert normalized["documents"]["lesson-a.pdf"]["chunk_count"] == 3


def test_store_manager_prefers_active_version_documents(tmp_path):
    manager = CourseRagStoreManager(
        persist_root=tmp_path,
        embedding_provider=_FakeEmbeddingProvider(),
    )

    normalized = manager._normalize_meta(
        {
            "updated_at": "2026-06-13T00:00:00+00:00",
            "active_index_version": "v2",
            "documents": {"legacy.pdf": {"chunk_count": 99}},
            "index_versions": {
                "v1": {"documents": {"old.pdf": {"chunk_count": 1}}},
                "v2": {"documents": {"new.pdf": {"chunk_count": 4}}},
            },
        }
    )

    assert list(normalized["documents"].keys()) == ["new.pdf"]
    assert normalized["documents"]["new.pdf"]["chunk_count"] == 4


def test_list_indexed_documents_exposes_indexing_v2_fields(tmp_path):
    manager = CourseRagStoreManager(
        persist_root=tmp_path,
        embedding_provider=_FakeEmbeddingProvider(),
    )
    manager.save_meta(
        "course-1",
        {
            "active_index_version": "v3",
            "index_versions": {
                "v3": {
                    "documents": {
                        "lecture-notes.pdf": {
                            "chunk_count": 12,
                            "indexed_at": "2026-06-13T00:00:00+00:00",
                            "chapter_id": "chapter-2",
                            "parser_used": "docling",
                            "page_count": 18,
                            "node_counts": {"leaf_chunk": 9, "table_chunk": 2, "section_summary": 1},
                            "quality_report": {"quality_status": "ok"},
                            "index_version": "v3",
                        }
                    }
                }
            },
        },
    )
    service = CourseRagIndexingService(
        store_manager=manager,
        chunk_size=800,
        chunk_overlap=120,
    )

    docs = service.list_indexed_documents("course-1")

    assert docs == [
        {
            "doc_name": "lecture-notes.pdf",
            "chunk_count": 12,
            "indexed_at": "2026-06-13T00:00:00+00:00",
            "chapter_id": "chapter-2",
            "parser_used": "docling",
            "page_count": 18,
            "node_counts": {"leaf_chunk": 9, "table_chunk": 2, "section_summary": 1},
            "quality_status": "ok",
            "index_version": "v3",
        }
    ]


def test_bm25_retrieve_for_course_keeps_table_chunks(monkeypatch):
    store = _FakeVectorStore(
        payload={
            "ids": ["a", "b"],
            "documents": ["RTT throughput reference", "| Metric | Value |\n| RTT | 30ms |"],
            "metadatas": [
                {"doc_name": "notes.pdf", "node_type": "leaf_chunk", "chapter_id": "c1"},
                {"doc_name": "notes.pdf", "node_type": "table_chunk", "chapter_id": "c1"},
            ],
        }
    )

    class _FakeBM25:
        def __init__(self, corpus_tokens, k1=1.5, b=0.75):
            self.corpus_tokens = corpus_tokens

        def get_scores(self, query_tokens):
            return [0.8, 0.7]

    fake_numpy = SimpleNamespace(argsort=lambda scores: [0, 1])
    monkeypatch.setitem(__import__("sys").modules, "rank_bm25", SimpleNamespace(BM25Okapi=_FakeBM25))
    monkeypatch.setitem(__import__("sys").modules, "numpy", fake_numpy)

    results = bm25_retrieve_for_course(
        course_id="course-1",
        query="RTT table",
        top_k=2,
        meta={"documents": {"notes.pdf": {"chapter_id": "c1"}}},
        get_store_fn=lambda _course_id: store,
        chapter_id="",
    )

    assert [item["node_type"] for item in results] == ["table_chunk", "leaf_chunk"]


async def test_reuse_existing_index_clones_nodes_and_diagnostics(monkeypatch):
    import backend.services.course_rag_service as course_rag_package

    fake_store_manager = _FakeReuseStoreManager()
    fake_service = SimpleNamespace(
        _store_manager=fake_store_manager,
        get_document_diagnostics=lambda _course_id, _doc_name: {"quality_report": {"quality_status": "ok"}},
        list_indexed_documents=lambda _course_id: [{"doc_name": "existing.pdf"}],
        active_index_version=lambda _course_id: "v1",
    )
    monkeypatch.setitem(course_rag_package.__dict__, "course_rag_service", fake_service)

    parsed = ParsedDocumentResult(
        text="Normalized shared chunk",
        normalized_markdown="Normalized shared chunk",
        structure={},
        quality_report={"quality_status": "ok", "page_count": 2},
        parser_used="docling",
        parser_strategy="auto",
        fallback_chain=["marker"],
        artifacts=[],
    )

    result = await _reuse_existing_index(
        course_id="course-1",
        filename="new.pdf",
        chapter_id="chapter-b",
        source_hash="source-hash-2",
        normalized_hash="normalized-hash-2",
        parsed=parsed,
        index_version="v2",
        artifact_refs=[{"kind": "normalized_markdown", "storage_path": "uploads/knowledge_base/course-1/a.md"}],
        existing_job={"filename": "existing.pdf", "job_id": "job-old"},
    )

    assert result["indexed"] is True
    assert result["reused_normalized_index"] is True
    assert fake_store_manager.target_store.add_calls[0]["ids"] == ["stable-node-1:new.pdf"]
    assert fake_store_manager.target_store.add_calls[0]["metadatas"][0]["doc_name"] == "new.pdf"
    assert fake_store_manager.clone_call["overrides"]["parser_used"] == "docling"
    assert fake_store_manager.clone_call["overrides"]["chapter_id"] == "chapter-b"
    assert fake_store_manager.diagnostics_call["payload"]["reused_from_job_id"] == "job-old"
