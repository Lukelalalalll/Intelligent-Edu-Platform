from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx

from backend.config import Config

logger = logging.getLogger(__name__)


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


def build_lifespan(
    *,
    ensure_indexes_on_startup: bool,
    run_core_startup_jobs: bool,
    cleanup_question_files_on_startup: bool,
    reset_indexing_jobs_on_startup: bool,
    enable_rag_preload: bool | None,
):
    @asynccontextmanager
    async def lifespan(app):
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
