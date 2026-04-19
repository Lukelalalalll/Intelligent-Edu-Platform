"""Global FastAPI exception handlers.

Call register_exception_handlers(app) once during application startup
(after app = FastAPI(...)) to install all handlers.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.exceptions.domain import (
    AppError,
    ExternalServiceError,
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all application-level exception handlers on *app*."""

    @app.exception_handler(ResourceNotFoundError)
    async def not_found_handler(request: Request, exc: ResourceNotFoundError):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": str(exc)})

    @app.exception_handler(PermissionDeniedError)
    async def permission_denied_handler(request: Request, exc: PermissionDeniedError):
        return JSONResponse(status_code=403, content={"error": "forbidden", "message": str(exc)})

    @app.exception_handler(ValidationError)
    async def validation_handler(request: Request, exc: ValidationError):
        return JSONResponse(
            status_code=422, content={"error": "validation_error", "message": str(exc)}
        )

    @app.exception_handler(ExternalServiceError)
    async def external_service_handler(request: Request, exc: ExternalServiceError):
        logger.warning("External service error: %s", exc)
        return JSONResponse(
            status_code=502,
            content={"error": "external_service_unavailable", "message": str(exc)},
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        logger.warning("Application error: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "application_error", "message": str(exc)}
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", "unknown")
        logger.exception(
            "Unhandled exception | request_id=%s path=%s",
            request_id,
            request.url.path,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_server_error",
                "message": "An unexpected error occurred. Please try again.",
                "request_id": request_id,
            },
        )
