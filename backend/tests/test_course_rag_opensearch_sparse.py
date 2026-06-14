from __future__ import annotations

from types import SimpleNamespace

from backend.services.course_rag_service.opensearch_sparse_retriever import (
    OpenSearchSparseRetriever,
    build_course_sparse_index_name,
    build_course_sparse_mapping,
    build_opensearch_sparse_query,
    sanitize_metadata_filters,
)
from backend.services.course_rag_service.indexing_service import CourseRagIndexingService
from backend.services.course_rag_service.retrieval_service import CourseRagRetrievalService


def _settings(**overrides):
    base = {
        "RAG_OPENSEARCH_ENABLED": True,
        "RAG_OPENSEARCH_ENDPOINT": "http://127.0.0.1:9200",
        "RAG_OPENSEARCH_INDEX_PREFIX": "course-rag",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class _FakeIndices:
    def __init__(self, exists_result=True):
        self.exists_result = exists_result
        self.exists_calls: list[dict] = []
        self.create_calls: list[dict] = []

    def exists(self, *, index, params=None, headers=None):
        self.exists_calls.append({"index": index})
        return self.exists_result

    def create(self, *, index, body=None, params=None, headers=None):
        self.create_calls.append({"index": index, "body": body})
        return {"acknowledged": True}


class _FakeClient:
    def __init__(self, *, exists_result=True, search_hits=None):
        self.indices = _FakeIndices(exists_result=exists_result)
        self.search_hits = list(search_hits or [])
        self.search_calls: list[dict] = []

    def search(self, *, index, body=None, params=None, headers=None):
        self.search_calls.append({"index": index, "body": body})
        return {"hits": {"hits": list(self.search_hits)}}


class _DummyStoreManager:
    def load_meta(self, course_id: str):
        return {"documents": {"notes.pdf": {"chapter_id": "c1"}}}

    def get_store(self, course_id: str):
        raise AssertionError("vector store should not be used in sparse fallback tests")

    def get_all_indexed_courses(self):
        return []


class _SyncStore:
    def __init__(self):
        self.get_calls: list[dict] = []

    def get(self, *, ids=None, include=None, where=None):
        self.get_calls.append({"ids": list(ids or []), "include": include, "where": where})
        return {
            "ids": ["stable-1"],
            "documents": ["Transport timeout content"],
            "metadatas": [
                {
                    "doc_name": "notes.pdf",
                    "chapter_id": "c1",
                    "chunk_stable_id": "stable-1",
                    "section_path": "Transport > TCP",
                    "node_type": "leaf_chunk",
                    "page_start": 3,
                    "page_end": 3,
                    "heading_level": 2,
                }
            ],
        }


class _SyncStoreManager:
    def __init__(self):
        self.store = _SyncStore()
        self.activated: list[str] = []

    def get_meta_lock(self, course_id: str):
        class _Lock:
            def __enter__(self_inner):
                return None

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        return _Lock()

    def load_meta(self, course_id: str):
        return {"index_versions": {"v2": {"documents": {"notes.pdf": {"chunk_count": 1, "chunk_ids": ["stable-1"]}}}}}

    def finalize_index_version(self, course_id: str, index_version: str, **kwargs):
        return {"documents": kwargs["documents"], "build_status": kwargs["build_status"]}

    def activate_index_version(self, course_id: str, index_version: str):
        self.activated.append(index_version)

    def documents_meta(self, course_id: str, index_version: str | None = None):
        return {"notes.pdf": {"chunk_count": 1, "chunk_ids": ["stable-1"]}}

    def get_store(self, course_id: str, index_version: str | None = None):
        return self.store


def test_opensearch_sparse_retriever_returns_empty_when_disabled():
    retriever = OpenSearchSparseRetriever(settings=_settings(RAG_OPENSEARCH_ENABLED=False))
    result = retriever.retrieve_with_status(
        course_id="course-1",
        query="tcp timeout",
        top_k=5,
        metadata_filters={"doc_name": "notes.pdf"},
    )

    assert result["status"] == "disabled"
    assert result["results"] == []


def test_build_course_sparse_index_name_uses_sparse_suffix():
    name = build_course_sparse_index_name(
        "Course:ABC/123",
        settings=_settings(RAG_OPENSEARCH_INDEX_PREFIX="Enterprise RAG"),
    )
    assert name == "enterprise-rag-course-abc-123-sparse"


def test_build_course_sparse_mapping_contains_supported_fields():
    mapping = build_course_sparse_mapping()
    props = mapping["mappings"]["properties"]

    assert props["course_id"]["type"] == "keyword"
    assert props["doc_name"]["fields"]["text"]["type"] == "text"
    assert props["section_path"]["fields"]["text"]["type"] == "text"
    assert props["page_start"]["type"] == "integer"
    assert props["contextualized_text"]["type"] == "text"


def test_build_opensearch_sparse_query_builds_filters_and_full_text_query():
    query = build_opensearch_sparse_query(
        course_id="course-1",
        query="transport layer timeout",
        top_k=7,
        metadata_filters={
            "doc_name": "notes.pdf",
            "chapter_id": "c1",
            "section_path": "Transport > TCP",
            "node_type": "table_chunk",
            "page_start": "12",
            "page_end": 15,
            "heading_level": "2",
            "ignored": "x",
        },
    )

    assert query["size"] == 7
    bool_query = query["query"]["bool"]
    assert {"term": {"course_id": "course-1"}} in bool_query["filter"]
    assert {"term": {"doc_name": "notes.pdf"}} in bool_query["filter"]
    assert {"term": {"chapter_id": "c1"}} in bool_query["filter"]
    assert {"term": {"section_path": "Transport > TCP"}} in bool_query["filter"]
    assert {"term": {"node_type": "table_chunk"}} in bool_query["filter"]
    assert {"range": {"page_start": {"gte": 12}}} in bool_query["filter"]
    assert {"range": {"page_end": {"lte": 15}}} in bool_query["filter"]
    assert {"term": {"heading_level": 2}} in bool_query["filter"]
    assert bool_query["minimum_should_match"] == 1
    assert sum(1 for clause in bool_query["should"] if "multi_match" in clause) == 2


def test_sanitize_metadata_filters_drops_invalid_values():
    sanitized = sanitize_metadata_filters(
        {
            "doc_name": "notes.pdf",
            "chapter_id": "",
            "page_start": "3",
            "page_end": "bad",
            "heading_level": 4,
            "unsupported": "x",
        }
    )

    assert sanitized == {
        "doc_name": "notes.pdf",
        "page_start": 3,
        "heading_level": 4,
    }


def test_retrieval_service_falls_back_to_bm25_when_opensearch_unavailable(monkeypatch):
    service = CourseRagRetrievalService(store_manager=_DummyStoreManager())

    monkeypatch.setattr(
        service._opensearch_sparse,
        "retrieve_with_status",
        lambda **kwargs: {"results": [], "status": "client_unavailable", "source": "opensearch_sparse"},
    )
    monkeypatch.setattr(
        service,
        "_bm25_retrieve",
        lambda course_id, query, top_k, chapter_id="", metadata_filters=None: [
            {
                "course_id": course_id,
                "doc_name": "notes.pdf",
                "text": "fallback result",
                "score": 1.2,
                "sparse_score": 1.2,
                "retrieval_sources": ["bm25"],
            }
        ],
    )

    result = service._sparse_retrieve_one(
        "course-1",
        "timeout retransmission",
        4,
        {"doc_name": "notes.pdf"},
        "",
    )

    assert result["source"] == "bm25"
    assert result["fallback_used"] is True
    assert result["fallback_reason"] == "client_unavailable"
    assert result["results"][0]["retrieval_sources"] == ["bm25"]


async def test_retrieval_service_uses_opensearch_sparse_results_when_available(monkeypatch):
    service = CourseRagRetrievalService(store_manager=_DummyStoreManager())

    monkeypatch.setattr(
        service,
        "_collect_available_metadata",
        lambda course_ids: (["notes.pdf"], ["c1"]),
    )
    async def _vector(*args, **kwargs):
        return []

    async def _late(*args, **kwargs):
        return []

    monkeypatch.setattr(service, "_retrieve_vector_candidates", _vector)
    monkeypatch.setattr(service, "_retrieve_late_interaction_candidates", _late)

    async def _sparse(*args, **kwargs):
        return {
            "results": [
                {
                    "course_id": "course-1",
                    "doc_name": "notes.pdf",
                    "text": "opensearch sparse result",
                    "score": 3.4,
                    "sparse_score": 3.4,
                    "retrieval_score": 3.4,
                    "section_path": "Transport > TCP",
                    "heading_path": "Transport > TCP",
                    "page_start": 8,
                    "page_end": 8,
                    "page_num": 8,
                    "node_type": "leaf_chunk",
                    "filter_match": 1.0,
                    "retrieval_sources": ["opensearch_sparse"],
                    "title_overlap": 0.5,
                    "heading_overlap": 0.5,
                    "lexical_overlap": 0.5,
                }
            ],
            "trace_stage": "opensearch_sparse",
            "source": "opensearch_sparse",
            "fallback_used": False,
            "fallback_reason": "",
        }

    monkeypatch.setattr(service, "_retrieve_sparse_candidates", _sparse)

    response = await service.retrieve_for_student_detailed(
        student_id="student-1",
        query="TCP timeout",
        top_k=2,
        course_ids=["course-1"],
        use_hybrid=True,
        debug=True,
        debug_retrieval=True,
    )

    assert response.results
    assert "opensearch_sparse" in response.results[0]["retrieval_sources"]
    sparse_trace = [item for item in response.retrieval_trace if item["stage"] == "opensearch_sparse"]
    assert sparse_trace
    assert sparse_trace[0]["source"] == "opensearch_sparse"
    assert sparse_trace[0]["fallback_used"] is False


def test_opensearch_sparse_retriever_normalizes_hits():
    client = _FakeClient(
        exists_result=True,
        search_hits=[
            {
                "_id": "chunk-1",
                "_score": 4.2,
                "_source": {
                    "course_id": "course-1",
                    "doc_name": "notes.pdf",
                    "chapter_id": "c1",
                    "section_path": "Transport > TCP",
                    "node_type": "leaf_chunk",
                    "page_start": 9,
                    "page_end": 10,
                    "heading_level": 2,
                    "contextualized_text": "TCP timeout and retransmission behavior",
                    "text": "raw body",
                },
            }
        ],
    )
    retriever = OpenSearchSparseRetriever(client=client, settings=_settings())

    results = retriever.retrieve(
        course_id="course-1",
        query="TCP timeout",
        top_k=3,
        metadata_filters={"doc_name": "notes.pdf"},
    )

    assert len(results) == 1
    assert results[0]["doc_name"] == "notes.pdf"
    assert results[0]["page_start"] == 9
    assert results[0]["heading_level"] == 2
    assert results[0]["retrieval_sources"] == ["opensearch_sparse"]
    assert client.search_calls[0]["index"] == "course-rag-course-1-sparse"


def test_finalize_index_build_syncs_active_version_to_opensearch(monkeypatch):
    store_manager = _SyncStoreManager()
    service = CourseRagIndexingService(store_manager=store_manager, chunk_size=800, chunk_overlap=120)
    captured = {}

    monkeypatch.setattr("backend.services.course_rag_service.indexing_service.opensearch_enabled", lambda settings: True)

    def _sync(course_id, payload, **kwargs):
        captured["course_id"] = course_id
        captured["payload"] = list(payload)
        return True

    monkeypatch.setattr("backend.services.course_rag_service.indexing_service.sync_course_sparse_index", _sync)

    result = service.finalize_index_build("course-1", "v2", activate=True)

    assert result["build_status"] == "active"
    assert store_manager.activated == ["v2"]
    assert captured["course_id"] == "course-1"
    assert captured["payload"][0]["id"] == "stable-1"
    assert captured["payload"][0]["metadata"]["doc_name"] == "notes.pdf"


def test_assign_document_chapter_triggers_opensearch_resync(monkeypatch):
    class _AssignStoreManager(_SyncStoreManager):
        def __init__(self):
            super().__init__()
            self.saved_meta = None

        def active_index_version(self, course_id: str):
            return "v3"

        def load_meta(self, course_id: str):
            return {
                "index_versions": {
                    "v3": {
                        "documents": {
                            "notes.pdf": {
                                "chapter_id": "old",
                                "chunk_ids": ["stable-1"],
                            }
                        }
                    }
                }
            }

        def save_meta(self, course_id: str, payload):
            self.saved_meta = payload

    store_manager = _AssignStoreManager()
    service = CourseRagIndexingService(store_manager=store_manager, chunk_size=800, chunk_overlap=120)
    sync_calls = []

    monkeypatch.setattr("backend.services.course_rag_service.indexing_service.opensearch_enabled", lambda settings: True)
    monkeypatch.setattr(
        service,
        "_sync_opensearch_active_version",
        lambda course_id, index_version: sync_calls.append((course_id, index_version)),
    )

    changed = service.assign_document_chapter("course-1", "notes.pdf", "chapter-new")

    assert changed is True
    assert store_manager.saved_meta["index_versions"]["v3"]["documents"]["notes.pdf"]["chapter_id"] == "chapter-new"
    assert sync_calls == [("course-1", "v3")]
