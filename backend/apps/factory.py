from __future__ import annotations

import logging
import os
import secrets
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from typing import Iterable

import httpx
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware

from backend.config import Config
from backend.exceptions.handlers import register_exception_handlers
from backend.middleware.logging import register_logging_middleware

logger = logging.getLogger(__name__)

API_V1_PREFIX = "/api/v1"
API_COMPAT_PREFIX = "/api"
CSRF_EXEMPT_PATHS = {
    "/healthz",
    "/internal/health",
    "/api/health",
    "/api/v1/health",
}


def setup_logging() -> None:
    log_level = getattr(logging, Config.LOG_LEVEL, logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    if not root_logger.handlers:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        root_logger.addHandler(stream_handler)

    logger.info("Logging initialized with level=%s", Config.LOG_LEVEL)


def ensure_dir_and_mount(app: FastAPI, mount_path: str, directory: str, name: str) -> None:
    os.makedirs(directory, exist_ok=True)
    app.mount(mount_path, StaticFiles(directory=directory), name=name)


def build_health_router() -> APIRouter:
    router = APIRouter(tags=["System"])

    @router.get("/health")
    async def health_check():
        from backend.core.database import check_health
        from backend.core.opensearch_client import check_opensearch_health

        db_health = await check_health()
        opensearch_health = check_opensearch_health()
        return {
            "status": (
                "ok"
                if db_health.get("status") == "ok" and opensearch_health.get("status") in {"ok", "disabled"}
                else "degraded"
            ),
            "database": db_health,
            "opensearch": opensearch_health,
        }

    return router


def _is_gateway_exempt(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return True
    return path in {
        "/healthz",
        "/internal/health",
        "/api/health",
        "/api/v1/health",
    }


def add_internal_gateway_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def internal_gateway_guard(request: Request, call_next):
        if _is_gateway_exempt(request.url.path, request.method):
            return await call_next(request)

        expected = Config.INTERNAL_GATEWAY_TOKEN
        if not expected:
            return JSONResponse(
                status_code=503,
                content={"detail": "INTERNAL_GATEWAY_TOKEN is not configured"},
            )

        received = request.headers.get(Config.INTERNAL_GATEWAY_HEADER, "")
        if not secrets.compare_digest(str(received), str(expected)):
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        return await call_next(request)


def _normalize_origin(origin: str) -> str:
    parsed = urlparse(origin)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def add_csrf_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def csrf_guard(request: Request, call_next):
        if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
            return await call_next(request)
        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        has_auth_cookie = bool(request.cookies.get(Config.JWT_ACCESS_COOKIE_NAME))
        if not has_auth_cookie:
            return await call_next(request)

        origin = _normalize_origin(request.headers.get("Origin", ""))
        if origin:
            allowed_origins = {_normalize_origin(value) for value in Config.ALLOWED_ORIGINS}
            if origin not in allowed_origins:
                return JSONResponse(status_code=403, content={"detail": "Request origin is not allowed"})

        if not Config.JWT_COOKIE_CSRF_PROTECT:
            return await call_next(request)

        csrf_cookie = request.cookies.get(Config.JWT_CSRF_COOKIE_NAME, "")
        csrf_header = request.headers.get(Config.JWT_CSRF_HEADER_NAME, "")
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})

        return await call_next(request)


def build_lifespan(
    *,
    ensure_indexes_on_startup: bool,
    run_core_startup_jobs: bool,
    cleanup_question_files_on_startup: bool,
    reset_indexing_jobs_on_startup: bool,
    enable_rag_preload: bool | None,
):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        validation_warnings = Config.validate_startup()
        for item in validation_warnings:
            logger.warning("Startup security warning: %s", item)

        http2_enabled = True
        try:
            import h2  # noqa: F401
        except Exception:
            http2_enabled = False
            logger.warning("h2 package is not installed; falling back to HTTP/1.1 for shared httpx client.")

        app.state.http_client = httpx.AsyncClient(
            timeout=Config.COZE_REQUEST_TIMEOUT_SECONDS,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=30, keepalive_expiry=60),
            http2=http2_enabled,
        )

        try:
            from backend.core.opensearch_client import check_opensearch_health

            opensearch_health = check_opensearch_health()
            if opensearch_health.get("status") == "ok":
                logger.info(
                    "OpenSearch connected: cluster=%s version=%s endpoint=%s",
                    opensearch_health.get("cluster_name"),
                    opensearch_health.get("version"),
                    opensearch_health.get("endpoint"),
                )
            elif opensearch_health.get("status") != "disabled":
                logger.warning("OpenSearch startup status: %s", opensearch_health)
        except Exception:
            logger.exception("Failed to initialize OpenSearch health check on startup")

        if ensure_indexes_on_startup:
            try:
                from backend.core.database import ensure_indexes

                await ensure_indexes()
            except Exception:
                logger.exception("Failed to ensure MongoDB indexes on startup")

        if run_core_startup_jobs or cleanup_question_files_on_startup:
            try:
                from backend.services.questions import cleanup_old_files

                cleanup_old_files()
            except Exception:
                logger.exception("Failed to run sub2 file cleanup on startup")

        if run_core_startup_jobs or reset_indexing_jobs_on_startup:
            try:
                from backend.core.database import db

                result = await db["indexing_jobs"].update_many(
                    {"status": {"$in": ["pending", "processing"]}},
                    {"$set": {"status": "failed", "error": "Server restarted - job interrupted"}},
                )
                if result.modified_count > 0:
                    logger.warning("Reset %d stuck indexing jobs to 'failed' on startup", result.modified_count)
            except Exception:
                logger.exception("Failed to reset stuck indexing jobs on startup")

        should_preload_rag = Config.ENABLE_RAG_PRELOAD if enable_rag_preload is None else enable_rag_preload
        if should_preload_rag:
            try:
                from backend.services.course_rag_service.service import course_rag_service

                logger.info("Preloading embedding model (%s)...", Config.RAG_EMBEDDING_MODEL)
                _ = course_rag_service.embeddings
                logger.info("Embedding model loaded")
            except Exception:
                logger.warning("Failed to preload embedding model - will load lazily on first request", exc_info=True)

            try:
                from backend.services.course_rag_service.reranker import _get_cross_encoder

                logger.info("Preloading reranker model (BAAI/bge-reranker-base)...")
                _get_cross_encoder()
                logger.info("Reranker model loaded")
            except Exception:
                logger.warning("Failed to preload reranker model - will load lazily on first request", exc_info=True)

        try:
            yield
        finally:
            await app.state.http_client.aclose()
            try:
                from backend.core.database import close_database_client

                close_database_client()
            except Exception:
                logger.debug("Failed to close MongoDB client on shutdown", exc_info=True)
            try:
                from backend.services.course_rag_service.service import shutdown_retrieval_pool

                shutdown_retrieval_pool()
                logger.info("RAG retrieval thread pool shut down")
            except Exception:
                logger.debug("Failed to shut down RAG retrieval thread pool", exc_info=True)

    return lifespan


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

    app.add_middleware(SessionMiddleware, secret_key=Config.SECRET_KEY)
    if limiter is not None:
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    register_exception_handlers(app)
    register_logging_middleware(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=Config.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    add_csrf_middleware(app)

    if require_gateway_token:
        add_internal_gateway_middleware(app)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"status": "ok"}

    @app.get("/internal/health", include_in_schema=False)
    async def internal_health():
        from backend.core.database import check_health
        from backend.core.opensearch_client import check_opensearch_health

        return {
            "status": "ok",
            "database": await check_health(),
            "opensearch": check_opensearch_health(),
        }

    health_router = build_health_router()
    for router in (*tuple(versioned_routers), health_router):
        app.include_router(router, prefix=API_V1_PREFIX)
        app.include_router(router, prefix=API_COMPAT_PREFIX, deprecated=True)

    for router in direct_routers:
        app.include_router(router)

    for folder in Config.ALL_FOLDERS:
        os.makedirs(folder, exist_ok=True)

    for mount_path, directory, name in static_mounts:
        ensure_dir_and_mount(app, mount_path, directory, name)

    return app
