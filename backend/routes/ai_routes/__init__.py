"""ai_routes package with explicit router aggregation."""

from .chat import router as chat_router
from .index_course import router as index_course_router
from .memory import router as memory_router
from .router import ai_router  # noqa: F401
from .session import router as session_router
from .study_coach import router as study_coach_router
from .study_stream import router as study_stream_router

for router in (
    session_router,
    chat_router,
    memory_router,
    study_coach_router,
    study_stream_router,
    index_course_router,
):
    ai_router.include_router(router)
