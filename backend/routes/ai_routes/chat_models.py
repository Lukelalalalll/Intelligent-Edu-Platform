"""Data containers for the /chat endpoint pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParsedRequest:
    """Immutable snapshot of a validated incoming chat request."""

    latest_user_message: str
    prompt_only_message: str
    uploaded_attachment_text: str
    effective_question: str
    latest_user_images: list[Any]
    tutor_mode: str  # "tutor" | "hint_only"
    requested_provider: str
    resolved_provider: str
    role: str
    is_student: bool
    user: dict
    user_id: str
    cleaned_messages: list[dict]
    compact_history: list[dict]
    memory_text: str
    session_id: str = ""
    session_backfilled: bool = False


@dataclass
class RAGResult:
    """All outputs from a RAG retrieval pass."""

    rag_context_text: str = ""
    web_context_text: str = ""
    rag_citations: list[dict] = field(default_factory=list)
    rag_top_k: int = 4
    rag_retrieve_top_n: int = 10
    rag_retry_used: bool = False
    rag_retry_success: bool = False
    rag_empty_after_retry: bool = False
    rag_retrieval_query: str = ""
    rag_rewritten_query: str = ""
    rag_retrieval_latency_ms: float = 0.0
    student_course_ids: list[str] = field(default_factory=list)
    forced_response_message: str = ""
    compact_history: list[dict] = field(default_factory=list)
    is_course_relevant: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> RAGResult:
        return cls(**{k: d[k] for k in cls.__dataclass_fields__ if k in d})


@dataclass
class StreamMeta:
    """Mutable metadata dict emitted at the beginning of the SSE stream."""

    provider: str = ""
    requested_provider: str = ""
    tutor_mode: str = "tutor"
    rag_top_k: int = 4
    rag_retrieve_top_n: int = 10
    rag_retrieval_query: str = ""
    rag_rewritten_query: str = ""
    rag_retry_used: bool = False
    rag_retry_success: bool = False
    rag_empty_after_retry: bool = False
    rag_retrieval_latency_ms: float = 0.0
    # Optional extras
    citations: list[dict] | None = None
    is_course_relevant: bool = False
    warning: str | None = None
    fallback_from: str | None = None
    fallback_to: str | None = None
    postcheck_downgraded: int | None = None

    def to_dict(self) -> dict:
        d: dict = {
            "provider": self.provider,
            "requested_provider": self.requested_provider,
            "tutor_mode": self.tutor_mode,
            "rag_top_k": self.rag_top_k,
            "rag_retrieve_top_n": self.rag_retrieve_top_n,
            "rag_retrieval_query": self.rag_retrieval_query,
            "rag_rewritten_query": self.rag_rewritten_query,
            "rag_retry_used": self.rag_retry_used,
            "rag_retry_success": self.rag_retry_success,
            "rag_empty_after_retry": self.rag_empty_after_retry,
            "rag_retrieval_latency_ms": self.rag_retrieval_latency_ms,
        }
        if self.citations:
            d["citations"] = self.citations
        d["is_course_relevant"] = self.is_course_relevant
        if self.warning is not None:
            d["warning"] = self.warning
        if self.fallback_from is not None:
            d["fallback_from"] = self.fallback_from
        if self.fallback_to is not None:
            d["fallback_to"] = self.fallback_to
        if self.postcheck_downgraded is not None:
            d["postcheck_downgraded"] = self.postcheck_downgraded
        return d

    @classmethod
    def from_rag(cls, rag: RAGResult, *, provider: str, requested_provider: str, tutor_mode: str) -> StreamMeta:
        return cls(
            provider=provider,
            requested_provider=requested_provider,
            tutor_mode=tutor_mode,
            rag_top_k=rag.rag_top_k,
            rag_retrieve_top_n=rag.rag_retrieve_top_n,
            rag_retrieval_query=rag.rag_retrieval_query,
            rag_rewritten_query=rag.rag_rewritten_query,
            rag_retry_used=rag.rag_retry_used,
            rag_retry_success=rag.rag_retry_success,
            rag_empty_after_retry=rag.rag_empty_after_retry,
            rag_retrieval_latency_ms=rag.rag_retrieval_latency_ms,
            citations=rag.rag_citations if rag.rag_citations else None,
            is_course_relevant=rag.is_course_relevant,
        )
