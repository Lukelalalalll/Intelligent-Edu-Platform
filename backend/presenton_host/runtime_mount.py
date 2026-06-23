from __future__ import annotations

from fastapi import APIRouter, Depends, FastAPI

from .bootstrap import load_presenton_runtime
from .bootstrap_routes import bootstrap_router
from .paths import ensure_presenton_static_assets
from .request_context import presenton_request_context
from .export_routes import export_router

PRESENTON_HOST_ROUTER = APIRouter()
PRESENTON_HOST_ROUTER.include_router(bootstrap_router)
PRESENTON_HOST_ROUTER.include_router(export_router)
_PRESENTON_RUNTIME_ROUTER_WIRED = False


def ensure_presenton_router_wired() -> APIRouter:
    global _PRESENTON_RUNTIME_ROUTER_WIRED
    if _PRESENTON_RUNTIME_ROUTER_WIRED:
        return PRESENTON_HOST_ROUTER
    PRESENTON_HOST_ROUTER.include_router(
        load_presenton_runtime().API_V1_PPT_ROUTER,
        dependencies=[Depends(presenton_request_context)],
    )
    _PRESENTON_RUNTIME_ROUTER_WIRED = True
    return PRESENTON_HOST_ROUTER


def mount_presenton(app: FastAPI) -> None:
    ensure_presenton_static_assets()
    app.include_router(ensure_presenton_router_wired())
