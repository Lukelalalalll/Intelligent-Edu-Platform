"""questions_routes package with explicit router aggregation."""

from .generate import router as generate_router
from .history import router as history_router
from .question_ops import router as question_ops_router
from .router import questions_router  # noqa: F401
from .tools import router as tools_router

for router in (generate_router, tools_router, history_router, question_ops_router):
    questions_router.include_router(router)
