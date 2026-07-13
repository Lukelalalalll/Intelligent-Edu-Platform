"""HTTP request-logging middleware.

Call register_logging_middleware(app) once during application startup
(after middleware stack is configured) to install the middleware.
"""

import logging
import time
import uuid

from fastapi import FastAPI, Request

# Maps URL prefix → short group name used in per-route logger names.
ROUTE_GROUP_PREFIXES = (
    ("/api/auth", "auth"),
    ("/api/admin", "admin"),
    ("/api/ai", "ai"),
    ("/api/slides", "slides"),
    ("/api/questions", "questions"),
    ("/api/image-extractor", "image_extractor"),
    ("/api/diagram", "diagram"),
    ("/api/study-notes", "study_notes"),
    ("/api/teacher", "teacher"),
    ("/api/grading", "grading"),
    ("/data", "data"),
    ("/static", "static"),
    ("/test_pdf", "test_pdf"),
    ("/grading_annotated", "grading_annotated"),
)


def _resolve_route_group(path: str) -> str:
    normalized = str(path or "").strip().lower()
    for prefix, group in ROUTE_GROUP_PREFIXES:
        if normalized.startswith(prefix):
            return group
    return "app"


def _get_route_logger(path: str) -> logging.Logger:
    group = _resolve_route_group(path)
    return logging.getLogger(f"backend.route.{group}")


def register_logging_middleware(app: FastAPI) -> None:
    """Add the request-ID propagation and per-route request logging middleware."""

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        incoming_request_id = request.headers.get("X-Request-ID")
        request_id = incoming_request_id or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started_at = time.perf_counter()
        method = request.method
        path = request.url.path
        client = request.client.host if request.client else "unknown"
        route_logger = _get_route_logger(path)

        route_logger.info(
            "Request started | rid=%s method=%s path=%s client=%s",
            request_id,
            method,
            path,
            client,
        )
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001
            duration_ms = (time.perf_counter() - started_at) * 1000
            route_logger.exception(
                "Request failed | rid=%s method=%s path=%s duration_ms=%.2f",
                request_id,
                method,
                path,
                duration_ms,
            )
            raise

        duration_ms = (time.perf_counter() - started_at) * 1000
        response.headers["X-Request-ID"] = request_id
        route_logger.info(
            "Request completed | rid=%s method=%s path=%s status=%s duration_ms=%.2f",
            request_id,
            method,
            path,
            response.status_code,
            duration_ms,
        )
        return response
