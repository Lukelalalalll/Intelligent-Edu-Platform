"""slides_routes package: explicit router aggregation without import side effects."""

from .artifacts import router as artifacts_router
from .delivery import router as delivery_router
from .editor import router as editor_router
from .generation import router as generation_router
from .highlights import router as highlights_router
from .history import router as history_router
from .layout_preview import public_router as layout_preview_public_router
from .layout_preview import router as layout_preview_router
from .legacy import router as legacy_router
from .observability import router as observability_router
from .parse import router as parse_router
from .presenton_projection import router as presenton_projection_router
from .router import legacy_sub1_router, public_slides_router, slides_router
from .template import public_router as template_public_router
from .template import router as template_router
from .template_mapping import router as template_mapping_router

for router in (
    artifacts_router,
    delivery_router,
    generation_router,
    highlights_router,
    history_router,
    layout_preview_router,
    observability_router,
    parse_router,
    presenton_projection_router,
    template_router,
    template_mapping_router,
    editor_router,
):
    slides_router.include_router(router)

for router in (layout_preview_public_router, template_public_router):
    public_slides_router.include_router(router)

legacy_sub1_router.include_router(legacy_router)

__all__ = ["slides_router", "public_slides_router", "legacy_sub1_router"]
