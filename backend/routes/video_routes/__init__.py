"""video_routes package with explicit router aggregation."""

from .generation import router as generation_router
from .history import router as history_router
from .progress import router as progress_router
from .projects import router as projects_router
from .router import router
from .scripts import router as scripts_router
from .uploads import router as uploads_router

for child_router in (
    projects_router,
    uploads_router,
    generation_router,
    scripts_router,
    progress_router,
    history_router,
):
    router.include_router(child_router)

__all__ = ["router"]
