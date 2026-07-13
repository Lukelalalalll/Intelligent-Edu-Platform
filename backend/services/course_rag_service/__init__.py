"""course_rag_service package re-exports with lazy service import."""

from __future__ import annotations

from .types import CourseChunk  # noqa: F401

__all__ = [
    "CourseChunk",
    "CourseRagService",
    "course_rag_service",
    "invalidate_bm25_cache",
]


def __getattr__(name: str):
    if name in {"CourseRagService", "course_rag_service", "invalidate_bm25_cache"}:
        from .service import CourseRagService, course_rag_service, invalidate_bm25_cache

        exports = {
            "CourseRagService": CourseRagService,
            "course_rag_service": course_rag_service,
            "invalidate_bm25_cache": invalidate_bm25_cache,
        }
        return exports[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
