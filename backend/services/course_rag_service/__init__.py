"""course_rag_service package — re-exports public symbols for backward compatibility."""

from .types import CourseChunk  # noqa: F401
from .service import CourseRagService, course_rag_service, invalidate_bm25_cache  # noqa: F401
