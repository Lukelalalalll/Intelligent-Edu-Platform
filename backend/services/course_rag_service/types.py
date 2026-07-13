"""Shared types for the course RAG service."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

QueryClass = Literal[
    "keyword/factoid",
    "concept/explanation",
    "comparison",
    "multi-hop",
    "chapter/doc constrained",
    "out-of-domain",
]

RetrievalProfile = Literal["low-latency", "balanced", "high-recall"]
WebFallbackPolicy = Literal["disabled", "on_low_confidence"]


@dataclass
class CourseChunk:
    course_id: str
    text: str
    score: float
    doc_name: str = ""
    page_num: int = -1


@dataclass
class RetrievalPlan:
    query_class: QueryClass
    decomposed_queries: list[str] = field(default_factory=list)
    metadata_filters: dict[str, Any] = field(default_factory=dict)
    retrieval_profile: RetrievalProfile = "balanced"
    web_fallback_policy: WebFallbackPolicy = "disabled"
    allow_multi_query: bool = False
    allow_hyde: bool = False
    use_hybrid: bool = True
    use_late_interaction: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RetrievalConfidence:
    label: Literal["confident", "ambiguous", "incorrect"] = "ambiguous"
    score: float = 0.0
    coverage: float = 0.0
    score_margin: float = 0.0
    source_agreement: float = 0.0
    filter_satisfaction: float = 0.0
    source_diversity: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RetrievalResponse:
    results: list[dict[str, Any]] = field(default_factory=list)
    retrieval_plan: dict[str, Any] = field(default_factory=dict)
    retrieval_trace: list[dict[str, Any]] = field(default_factory=list)
    retrieval_confidence: dict[str, Any] = field(default_factory=dict)
    fallback_reason: str = ""
    evidence_spans: list[dict[str, Any]] = field(default_factory=list)
    latency_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
