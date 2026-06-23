from fastapi import APIRouter

from .crud_routes import crud_router
from .editing import editing_router
from .generation import generation_router
from .helpers import resolve_presentation_fonts as _resolve_presentation_fonts
from .streaming import stream_router

PRESENTATION_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])
PRESENTATION_ROUTER.include_router(crud_router)
PRESENTATION_ROUTER.include_router(stream_router)
PRESENTATION_ROUTER.include_router(generation_router)
PRESENTATION_ROUTER.include_router(editing_router)

__all__ = ["PRESENTATION_ROUTER", "_resolve_presentation_fonts"]
