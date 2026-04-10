import os
import logging
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from backend.config import Config
from starlette.middleware.sessions import SessionMiddleware
# 导入路由
from backend.routes.auth_routes import auth_router
from backend.routes.admin_routes import admin_router
from backend.routes.ai_routes import ai_router
from backend.routes.slides_routes import slides_router, public_slides_router, legacy_sub1_router
from backend.routes.questions_routes import questions_router
from backend.routes.image_extractor_routes import image_extractor_router
from backend.routes.diagram_routes import diagram_router
from backend.routes.study_notes_routes import study_notes_router
from backend.routes.teacher_routes import teacher_router
from backend.routes.grading_routes import grading_router
from backend.routes.ai_gateway_routes import ai_gateway_router
from backend.routes.email_routes import email_router
from backend.routes.chat_routes import chat_router
from backend.routes.diagnostic_routes import diagnostic_router

logger = logging.getLogger(__name__)

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
    ("/api/email", "email"),
    ("/data", "data"),
    ("/static", "static"),
    ("/test_pdf", "test_pdf"),
    ("/grading_annotated", "grading_annotated"),
)

ROUTERS = (
    auth_router,
    admin_router,
    ai_router,
    slides_router,
    public_slides_router,
    legacy_sub1_router,
    questions_router,
    image_extractor_router,
    diagram_router,
    study_notes_router,
    teacher_router,
    grading_router,
    ai_gateway_router,
    email_router,
    chat_router,
    diagnostic_router,
)


def _setup_logging() -> None:
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


def _resolve_route_group(path: str) -> str:
    normalized = str(path or "").strip().lower()
    for prefix, group in ROUTE_GROUP_PREFIXES:
        if normalized.startswith(prefix):
            return group
    return "app"


def _ensure_dir_and_mount(app_instance: FastAPI, mount_path: str, directory: str, name: str) -> None:
    os.makedirs(directory, exist_ok=True)
    app_instance.mount(mount_path, StaticFiles(directory=directory), name=name)


def _get_route_logger(path: str) -> logging.Logger:
    group = _resolve_route_group(path)
    return logging.getLogger(f"backend.route.{group}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup validation ──
    validation_warnings = Config.validate_startup()
    for item in validation_warnings:
        logger.warning("Startup security warning: %s", item)

    max_workers = max(1, (os.cpu_count() or 2) - 1)
    http2_enabled = True
    try:
        import h2  # noqa: F401
    except Exception:
        http2_enabled = False
        logger.warning("h2 package is not installed; falling back to HTTP/1.1 for shared httpx client.")

    app.state.process_pool = ProcessPoolExecutor(max_workers=max_workers)
    app.state.http_client = httpx.AsyncClient(
        timeout=Config.COZE_REQUEST_TIMEOUT_SECONDS,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=30, keepalive_expiry=60),
        http2=http2_enabled,
    )

    # ── Ensure MongoDB indexes ──
    try:
        from backend.core.database import ensure_indexes
        await ensure_indexes()
    except Exception:
        logger.exception("Failed to ensure MongoDB indexes on startup")

    # ── Clean up old sub2 temporary files ──
    try:
        from backend.services.questions_service import cleanup_old_files
        cleanup_old_files()
    except Exception:
        logger.exception("Failed to run sub2 file cleanup on startup")

    try:
        yield
    finally:
        await app.state.http_client.aclose()
        app.state.process_pool.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title="Intelligent Edu Platform API", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=Config.SECRET_KEY)

# Rate limiting
from backend.routes.auth_routes import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_setup_logging()

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler ──
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


# ── Health check endpoint ──
@app.get("/api/health", tags=["System"])
async def health_check():
    from backend.core.database import check_health
    db_health = await check_health()
    return {
        "status": "ok" if db_health.get("status") == "ok" else "degraded",
        "database": db_health,
    }


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

    route_logger.info("Request started | rid=%s method=%s path=%s client=%s", request_id, method, path, client)
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

# 创建目录
for folder in Config.ALL_FOLDERS:
    os.makedirs(folder, exist_ok=True)

# 提供数据文件静态访问（PDF 等）
DATA_ROOT = os.path.abspath(os.path.join(Config.BASE_DIR, os.pardir, 'data'))
_ensure_dir_and_mount(app, "/data", DATA_ROOT, "data")

# 提供测试 PDF 静态访问（用于 grading workbench 左侧 PDF）
TEST_PDF_ROOT = os.path.join(Config.BASE_DIR, 'test_pdf')
_ensure_dir_and_mount(app, "/test_pdf", TEST_PDF_ROOT, "test_pdf")

# 提供通用 static 资源访问（sub1 的模板预览图等）
STATIC_ROOT = os.path.join(Config.BASE_DIR, 'static')
_ensure_dir_and_mount(app, "/static", STATIC_ROOT, "static")

# 提供写入批注后的 PDF 静态访问
ANNOTATED_PDF_ROOT = os.path.join(Config.BASE_DIR, 'static', 'grading_annotated')
_ensure_dir_and_mount(app, "/grading_annotated", ANNOTATED_PDF_ROOT, "grading_annotated")

# 注册所有路由
for router in ROUTERS:
    app.include_router(router)

# === 启动命令 ===
# 在根目录下终端运行：
# uvicorn backend.main:app --host 0.0.0.0 --port 5009 --reload