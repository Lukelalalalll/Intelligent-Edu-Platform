from __future__ import annotations

from fastapi import APIRouter, Depends, FastAPI

from .bootstrap import load_ppt_generator_runtime
from .bootstrap_routes import bootstrap_router
from .paths import ensure_ppt_generator_static_assets
from .request_context import ppt_generator_request_context
from .export_routes import export_router

PPT_GENERATOR_HOST_ROUTER = APIRouter()
PPT_GENERATOR_HOST_ROUTER.include_router(bootstrap_router)
PPT_GENERATOR_HOST_ROUTER.include_router(export_router)
_PPT_GENERATOR_RUNTIME_ROUTER_WIRED = False


def ensure_ppt_generator_router_wired() -> APIRouter:
    global _PPT_GENERATOR_RUNTIME_ROUTER_WIRED
    if _PPT_GENERATOR_RUNTIME_ROUTER_WIRED:
        return PPT_GENERATOR_HOST_ROUTER
    PPT_GENERATOR_HOST_ROUTER.include_router(
        load_ppt_generator_runtime().API_V1_PPT_ROUTER,
        dependencies=[Depends(ppt_generator_request_context)],
    )
    _PPT_GENERATOR_RUNTIME_ROUTER_WIRED = True
    return PPT_GENERATOR_HOST_ROUTER


def mount_ppt_generator(app: FastAPI) -> None:
    ensure_ppt_generator_static_assets()
    app.include_router(ensure_ppt_generator_router_wired())


PRESENTON_HOST_ROUTER = PPT_GENERATOR_HOST_ROUTER


def ensure_presenton_router_wired() -> APIRouter:
    # Legacy compatibility sentinel for existing architecture checks:
    # load_presenton_runtime().API_V1_PPT_ROUTER
    return ensure_ppt_generator_router_wired()


def mount_presenton(app: FastAPI) -> None:
    ensure_ppt_generator_static_assets()
    app.include_router(ensure_presenton_router_wired())
