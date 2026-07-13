"""ai_gateway_routes package with explicit router aggregation."""

from .feedback import router as feedback_router
from .grading import router as grading_router
from .router import ai_gateway_router  # noqa: F401

for router in (feedback_router, grading_router):
    ai_gateway_router.include_router(router)
