import os
import logging
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

os.environ["TOKENIZERS_PARALLELISM"] = "false"

import httpx
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from backend.config import Config
from starlette.middleware.sessions import SessionMiddleware
from backend.exceptions.handlers import register_exception_handlers
from backend.middleware.logging import register_logging_middleware
# 导入路由
from backend.routes.auth_routes import auth_router
from backend.routes.admin_routes import admin_router
from backend.routes.ai_routes import ai_router
from backend.routes.slides_routes import slides_router, public_slides_router, legacy_sub1_router
from backend.routes.questions_routes import questions_router
from backend.routes.image_extractor_routes import image_extractor_router
from backend.routes.diagram_routes import diagram_router
from backend.routes.study_notes_routes import study_notes_router
from backend.routes.mailbox_routes import mailbox_router as teacher_router
from backend.routes.grading_routes import grading_router
from backend.routes.ai_gateway_routes import ai_gateway_router
from backend.routes.chat_routes import chat_router
from backend.routes.homework_routes import router as homework_router
from backend.routes.video_routes import router as video_router
from backend.routes.file_center_routes import file_center_router

logger = logging.getLogger(__name__)

# ── API versioning ──
API_V1_PREFIX = "/api/v1"
API_COMPAT_PREFIX = "/api"

# Routers with resource-only prefixes (e.g. /admin, /ai) — mounted under both v1 and compat
_VERSIONED_ROUTERS = (
    auth_router,
    admin_router,
    ai_router,
    slides_router,
    legacy_sub1_router,
    questions_router,
    image_extractor_router,
    diagram_router,
    study_notes_router,
    teacher_router,
    grading_router,
    ai_gateway_router,
    chat_router,
    video_router,
    file_center_router,
)

# Routers mounted directly on the app (non-API pages or self-versioned)
_DIRECT_ROUTERS = (
    public_slides_router,   # /slides – rendered HTML
    homework_router,        # /api/v2/homeworks – already versioned
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



def _ensure_dir_and_mount(app_instance: FastAPI, mount_path: str, directory: str, name: str) -> None:
    os.makedirs(directory, exist_ok=True)
    app_instance.mount(mount_path, StaticFiles(directory=directory), name=name)



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

    # ── Reset stuck indexing jobs from previous server lifecycle ──
    try:
        from backend.core.database import db
        result = await db["indexing_jobs"].update_many(
            {"status": {"$in": ["pending", "processing"]}},
            {"$set": {"status": "failed", "error": "Server restarted — job interrupted"}},
        )
        if result.modified_count > 0:
            logger.warning("Reset %d stuck indexing jobs to 'failed' on startup", result.modified_count)
    except Exception:
        logger.exception("Failed to reset stuck indexing jobs on startup")

    try:
        yield
    finally:
        await app.state.http_client.aclose()
        app.state.process_pool.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title="Intelligent Edu Platform API", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=Config.SECRET_KEY)

from backend.routes.auth_routes import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_setup_logging()
register_exception_handlers(app)
register_logging_middleware(app)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Deprecation header for unversioned /api/ routes ──
@app.middleware("http")
async def deprecation_header(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/v"):
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "2026-12-31"
        response.headers["Link"] = f'</api/v1{path[4:]}>; rel="successor-version"'
    return response


# ── Health check endpoint (included in both v1 and compat) ──
_health_router = APIRouter(tags=["System"])


@_health_router.get("/health")
async def health_check():
    from backend.core.database import check_health
    db_health = await check_health()
    return {
        "status": "ok" if db_health.get("status") == "ok" else "degraded",
        "database": db_health,
    }


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

# 提供上传文件静态访问（student submissions、homework uploads）
UPLOADS_ROOT = os.path.join(Config.BASE_DIR, 'uploads')
_ensure_dir_and_mount(app, "/uploads", UPLOADS_ROOT, "uploads")

GENERATED_ROOT = os.path.join(Config.BASE_DIR, 'generated', 'videos')
_ensure_dir_and_mount(app, "/generated/videos", GENERATED_ROOT, "generated_videos")

GENERATED_SUB4_ROOT = os.path.join(Config.BASE_DIR, 'generated', 'sub4')
_ensure_dir_and_mount(app, "/generated/sub4", GENERATED_SUB4_ROOT, "generated_sub4")

GENERATED_SUB3_ROOT = os.path.join(Config.BASE_DIR, 'generated', 'sub3')
_ensure_dir_and_mount(app, "/generated/sub3", GENERATED_SUB3_ROOT, "generated_sub3")

# ── Register versioned API routes ──
for _r in (*_VERSIONED_ROUTERS, _health_router):
    app.include_router(_r, prefix=API_V1_PREFIX)
    app.include_router(_r, prefix=API_COMPAT_PREFIX, deprecated=True)

for _r in _DIRECT_ROUTERS:
    app.include_router(_r)

# === 启动命令 ===
# 在根目录下终端运行：
# uvicorn backend.main:app --host 0.0.0.0 --port 5009 --reload