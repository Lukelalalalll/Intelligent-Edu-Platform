"""Pydantic request/response models for RAG evaluation endpoints."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from backend.core.ai_provider import AIProvider


# ---------------------------------------------------------------------------
# Wizard endpoints
# ---------------------------------------------------------------------------

class GenerateQuestionsRequest(BaseModel):
    course_id: str = Field(..., min_length=1)
    doc_names: List[str] = []
    n_questions: int = Field(default=10, ge=1, le=50)
    topic_hint: str = Field(default="", max_length=2000)
    provider: AIProvider = "local_ollama"


class TestCase(BaseModel):
    id: Optional[str] = None
    query: str = Field(default="", min_length=1)
    course_ids: List[str] = []
    expected_doc_names: List[str] = []
    expected_keywords: List[str] = []


class EvaluateABRequest(BaseModel):
    dataset: List[TestCase] = Field(..., min_length=1, max_length=200)
    top_k: int = Field(default=4, ge=1, le=20)
    mode: Literal["hybrid", "vector", "comparison"] = "comparison"
    selected_docs: List[str] = Field(
        default=[],
        description="If non-empty, only chunks from these documents are considered during scoring.",
    )


# ---------------------------------------------------------------------------
# Dataset CRUD endpoints
# ---------------------------------------------------------------------------

class CreateDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    cases: List[TestCase] = Field(..., min_length=1)
    description: str = ""


class RunEvaluationRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1)
    course_id: str = Field(..., min_length=1)
    config: dict = {}


class CaseTestRequest(BaseModel):
    course_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    use_hybrid: bool = True


class SetBaselineRequest(BaseModel):
    course_id: str = Field(..., min_length=1)


class QualityGateThresholds(BaseModel):
    max_hit_rate_drop_pct: float = Field(default=3.0, ge=0.0, le=100.0, description="Max allowed hit rate drop vs baseline (percentage points)")
    max_p95_latency_increase_pct: float = Field(default=20.0, ge=0.0, description="Max allowed p95 latency increase (percent)")
    max_error_rate: float = Field(default=0.02, ge=0.0, le=1.0, description="Max allowed empty retrieval rate (ratio 0.0-1.0)")


class QualityGateRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1)
    course_id: str = Field(..., min_length=1)
    config: dict = {}
    thresholds: QualityGateThresholds = Field(default_factory=QualityGateThresholds)
