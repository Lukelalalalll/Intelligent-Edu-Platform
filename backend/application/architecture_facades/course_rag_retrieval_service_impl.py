"""Compatibility entrypoint for course RAG retrieval workflows."""
from __future__ import annotations

from backend.application.architecture_facades.course_rag_retrieval import (
    CourseRagRetrievalService,
    shutdown_retrieval_pool,
)

__all__ = ["CourseRagRetrievalService", "shutdown_retrieval_pool"]
