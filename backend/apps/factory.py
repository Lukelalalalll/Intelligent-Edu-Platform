from __future__ import annotations

from typing import Iterable

from fastapi import APIRouter, FastAPI

from backend.apps.factory_health import build_health_router, register_health_endpoints
from backend.apps.factory_lifecycle import build_lifespan, setup_logging
from backend.apps.factory_middleware import apply_common_middleware
from backend.apps.factory_mounts import apply_static_mounts

API_V1_PREFIX = "/api/v1"
API_COMPAT_PREFIX = "/api"


def create_app(
    *,
    title: str,
    versioned_routers: Iterable[APIRouter] = (),
    direct_routers: Iterable[APIRouter] = (),
    static_mounts: Iterable[tuple[str, str, str]] = (),
    require_gateway_token: bool = False,
    ensure_indexes_on_startup: bool = False,
    run_core_startup_jobs: bool = False,
    cleanup_question_files_on_startup: bool = False,
    reset_indexing_jobs_on_startup: bool = False,
    enable_rag_preload: bool | None = None,
    limiter=None,
) -> FastAPI:
    setup_logging()
    app = FastAPI(
        title=title,
        lifespan=build_lifespan(
            ensure_indexes_on_startup=ensure_indexes_on_startup,
            run_core_startup_jobs=run_core_startup_jobs,
            cleanup_question_files_on_startup=cleanup_question_files_on_startup,
            reset_indexing_jobs_on_startup=reset_indexing_jobs_on_startup,
            enable_rag_preload=enable_rag_preload,
        ),
    )
    apply_common_middleware(app, limiter=limiter, require_gateway_token=require_gateway_token)
    register_health_endpoints(app)

    health_router = build_health_router()
    for router in (*tuple(versioned_routers), health_router):
        app.include_router(router, prefix=API_V1_PREFIX)
        app.include_router(router, prefix=API_COMPAT_PREFIX, deprecated=True)

    for router in direct_routers:
        app.include_router(router)

    apply_static_mounts(app, static_mounts)
    return app
