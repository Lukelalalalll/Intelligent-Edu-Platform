"""slides_routes package: re-export the shared FastAPI routers."""

from .router import legacy_sub1_router, public_slides_router, slides_router

# Import submodules so they can register routes on the shared routers.
from . import (  # noqa: F401
    delivery,
    history,
    layout_preview,
    observability,
    pipeline,
    presenton_projection,
    template,
    template_mapping,
)

# Editor has its own sub-router; mount it onto slides_router.
from .editor import router as editor_router

slides_router.include_router(editor_router)

__all__ = ["slides_router", "public_slides_router", "legacy_sub1_router"]
