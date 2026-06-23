from __future__ import annotations

from fastapi import APIRouter

from .delivery_artifact_routes import (
    _deck_dir,
    create_slides_delivery_job,
    get_slides_delivery_artifact,
    get_slides_delivery_job,
    get_svg_deck,
    get_svg_deck_design_spec,
    get_svg_deck_slide,
    router as artifact_router,
    slides_provider_health,
    slides_providers,
)
from .delivery_generate_routes import (
    generate_v2,
    get_generate_v2_task,
    router as generate_router,
    stream_generate_v2_task,
)
from .delivery_outline_routes import (
    generate_presenton_outline,
    router as outline_router,
    stream_presenton_assistant,
)

router = APIRouter()
for child_router in (artifact_router, generate_router, outline_router):
    router.include_router(child_router)
