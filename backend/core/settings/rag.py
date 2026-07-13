from __future__ import annotations

from pydantic import Field, field_validator

from .providers import ProviderSettingsSegment


class RagSettingsSegment(ProviderSettingsSegment):
    RAG_VECTORSTORE_DIR: str = ""
    RAG_EMBEDDING_MODEL: str = "BAAI/bge-m3"
    RAG_TWO_STAGE_CHAT_ENABLED: bool = True
    RAG_EMPTY_RETRY_ENABLED: bool = True
    RAG_POSTCHECK_ENABLED: bool = True
    RAG_RETRIEVE_TOP_N: int = 15
    RAG_ANSWER_TOP_K: int = 6
    RAG_EVIDENCE_MAX_CHARS: int = 4000
    RAG_EVIDENCE_MAX_CHARS_PER_CHUNK: int = 800
    RAG_CHUNK_SIZE: int = 1200
    RAG_CHUNK_OVERLAP: int = 200
    RAG_NEURAL_RERANK_ENABLED: bool = True
    RAG_NEURAL_RERANK_CANDIDATES: int = 20
    RAG_NEURAL_RERANK_MODEL: str = "BAAI/bge-reranker-v2-m3"
    RAG_QUERY_PLANNER_ENABLED: bool = True
    RAG_DEFAULT_PROFILE: str = "balanced"
    RAG_ENABLE_WEB_CORRECTION: bool = True
    RAG_WEB_CORRECTION_MIN_SCORE: float = 0.45
    RAG_STAGE1_CANDIDATE_LIMIT: int = 60
    RAG_STAGE2_CANDIDATE_LIMIT: int = 20
    RAG_HYBRID_DENSE_POOL: int = 80
    RAG_HYBRID_SPARSE_POOL: int = 80
    RAG_EXPANSION_POOL: int = 40
    RAG_USE_LATE_INTERACTION: bool = False
    RAG_LATE_INTERACTION_TOP_K: int = 20
    RAG_COLBERT_ENDPOINT: str = ""
    RAG_OPENSEARCH_ENABLED: bool = False
    RAG_OPENSEARCH_ENDPOINT: str = "http://127.0.0.1:9200"
    RAG_OPENSEARCH_INDEX_PREFIX: str = "course-rag"
    RAG_OPENSEARCH_USERNAME: str = ""
    RAG_OPENSEARCH_PASSWORD: str = ""
    RAG_OPENSEARCH_TIMEOUT_SECONDS: float = 5.0
    RAG_OPENSEARCH_VERIFY_CERTS: bool = False
    RAG_OPENSEARCH_CA_CERTS: str = ""
    RAG_ENABLE_HIERARCHICAL_RECALL: bool = True
    RAG_ENABLE_GRAPH_EXPANSION: bool = True
    RAG_EVIDENCE_MAX_SPANS: int = 8
    RAG_QUERY_LANGUAGE: str = "auto"
    RAG_CONTEXTUAL_RETRIEVAL_ENABLED: bool = False
    RAG_CONTEXTUAL_RETRIEVAL_MODEL: str = ""
    RAG_MULTI_QUERY_ENABLED: bool = True
    RAG_MULTI_QUERY_VARIANTS: int = 2
    RAG_HYDE_ENABLED: bool = False
    RAG_PARENT_EXPANSION_ENABLED: bool = True
    RAG_PARENT_EXPANSION_WINDOW: int = 1
    RAG_SELF_QUERY_ENABLED: bool = True
    RAG_LOST_IN_MIDDLE_REORDER: bool = True
    RAG_CHARS_PER_TOKEN: float = 2.5
    RAG_GENERATION_RESERVE_TOKENS: int = 1500
    RAG_SYSTEM_OVERHEAD_TOKENS: int = 600
    RAG_PROVIDER_CONTEXT_WINDOWS: dict = Field(
        default_factory=lambda: {
            "gemini": 1_000_000,
            "deepseek": 64_000,
            "zhipu": 128_000,
            "coze": 16_000,
            "local_ollama": 8_192,
        }
    )
    RAG_CACHE_TTL_SECONDS: int = 1800
    RAG_CACHE_MAX_ENTRIES: int = 2000
    RAG_SEMANTIC_CACHE_ENABLED: bool = True
    RAG_SEMANTIC_CACHE_THRESHOLD: float = 0.92
    RAG_SEMANTIC_CACHE_MAX_ENTRIES: int = 200
    RAG_VECTOR_SIMILARITY_THRESHOLD: float = 0.35
    RAG_RELEVANCE_THRESHOLD: float = 0.60
    RAG_POSTCHECK_OVERLAP_THRESHOLD: float = 0.18
    RAG_PDF_MAX_PAGES: int = 200
    RAG_EXTRACTION_TIMEOUT_SECONDS: float = 180.0
    RAG_OCR_DPI: int = 300
    RAG_INDEX_SCHEMA_VERSION: int = 2
    RAG_INDEX_DEFAULT_PROFILE: str = "quality"
    RAG_INDEX_DEFAULT_PARSER_STRATEGY: str = "auto"
    RAG_ENABLE_DOCLING: bool = True

    @field_validator("RAG_COLBERT_ENDPOINT", "RAG_OPENSEARCH_ENDPOINT", mode="before")
    @classmethod
    def strip_optional_urls(cls, value: str) -> str:
        return (str(value or "") or "").strip().rstrip("/")

    @field_validator("RAG_OPENSEARCH_INDEX_PREFIX", mode="before")
    @classmethod
    def normalize_opensearch_index_prefix(cls, value: str) -> str:
        raw = str(value or "course-rag").strip().lower()
        normalized = "".join(
            char if char.isalnum() or char in {"-", "_"} else "-" for char in raw
        )
        normalized = normalized.strip("-_")
        while "--" in normalized:
            normalized = normalized.replace("--", "-")
        return normalized or "course-rag"

    @field_validator("RAG_OPENSEARCH_TIMEOUT_SECONDS", mode="before")
    @classmethod
    def clamp_opensearch_timeout(cls, value) -> float:
        return max(1.0, min(60.0, float(value or 5.0)))
