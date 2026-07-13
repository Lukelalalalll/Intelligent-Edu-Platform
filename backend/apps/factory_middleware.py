from __future__ import annotations

import secrets
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from backend.config import Config
from backend.exceptions.handlers import register_exception_handlers
from backend.middleware.logging import register_logging_middleware

CSRF_EXEMPT_PATHS = {
    "/healthz",
    "/internal/health",
    "/api/health",
    "/api/v1/health",
}


def is_gateway_exempt(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return True
    return path in CSRF_EXEMPT_PATHS


def add_internal_gateway_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def internal_gateway_guard(request: Request, call_next):
        if is_gateway_exempt(request.url.path, request.method):
            return await call_next(request)
        expected = Config.INTERNAL_GATEWAY_TOKEN
        if not expected:
            return JSONResponse(status_code=503, content={"detail": "INTERNAL_GATEWAY_TOKEN is not configured"})
        received = request.headers.get(Config.INTERNAL_GATEWAY_HEADER, "")
        if not secrets.compare_digest(str(received), str(expected)):
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        return await call_next(request)


def normalize_origin(origin: str) -> str:
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
        origin = normalize_origin(request.headers.get("Origin", ""))
        if origin:
            allowed_origins = {normalize_origin(value) for value in Config.ALLOWED_ORIGINS}
            if origin not in allowed_origins:
                return JSONResponse(status_code=403, content={"detail": "Request origin is not allowed"})
        if not Config.JWT_COOKIE_CSRF_PROTECT:
            return await call_next(request)
        csrf_cookie = request.cookies.get(Config.JWT_CSRF_COOKIE_NAME, "")
        csrf_header = request.headers.get(Config.JWT_CSRF_HEADER_NAME, "")
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
        return await call_next(request)


def apply_common_middleware(app: FastAPI, *, limiter=None, require_gateway_token: bool = False) -> None:
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
