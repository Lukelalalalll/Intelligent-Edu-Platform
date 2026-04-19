"""slides_routes package — re-exports the three FastAPI routers."""
from .router import slides_router, public_slides_router, legacy_sub1_router

# Import submodules to register their routes on the routers above
from . import template, pipeline, template_mapping, delivery, observability, history, layout_preview, editor  # noqa: F401

__all__ = ["slides_router", "public_slides_router", "legacy_sub1_router"]
