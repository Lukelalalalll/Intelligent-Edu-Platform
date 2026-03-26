import os
import logging
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from backend.config import Config
from starlette.middleware.sessions import SessionMiddleware
# 导入路由
from backend.routes.auth_routes import auth_router
from backend.routes.admin_routes import admin_router
from backend.routes.ai_routes import ai_router
from backend.routes.sub1_routes import sub1_router, public_sub1_router
from backend.routes.sub2_routes import sub2_router
from backend.routes.sub3_routes import sub3_router
from backend.routes.sub4_routes import sub4_router
from backend.routes.teacher_routes import teacher_router
from backend.routes.grading_routes import grading_router
from backend.routes.ai_gateway_routes import ai_gateway_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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

    try:
        yield
    finally:
        await app.state.http_client.aclose()
        app.state.process_pool.shutdown(wait=True, cancel_futures=True)


app = FastAPI(title="Intelligent Edu Platform API", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=Config.SECRET_KEY)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建目录
for folder in Config.ALL_FOLDERS:
    os.makedirs(folder, exist_ok=True)

# 提供数据文件静态访问（PDF 等）
DATA_ROOT = os.path.abspath(os.path.join(Config.BASE_DIR, os.pardir, 'data'))
os.makedirs(DATA_ROOT, exist_ok=True)
app.mount("/data", StaticFiles(directory=DATA_ROOT), name="data")

# 提供测试 PDF 静态访问（用于 grading workbench 左侧 PDF）
TEST_PDF_ROOT = os.path.join(Config.BASE_DIR, 'test_pdf')
os.makedirs(TEST_PDF_ROOT, exist_ok=True)
app.mount("/test_pdf", StaticFiles(directory=TEST_PDF_ROOT), name="test_pdf")

# 提供通用 static 资源访问（sub1 的模板预览图等）
STATIC_ROOT = os.path.join(Config.BASE_DIR, 'static')
os.makedirs(STATIC_ROOT, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_ROOT), name="static")

# 提供写入批注后的 PDF 静态访问
ANNOTATED_PDF_ROOT = os.path.join(Config.BASE_DIR, 'static', 'grading_annotated')
os.makedirs(ANNOTATED_PDF_ROOT, exist_ok=True)
app.mount("/grading_annotated", StaticFiles(directory=ANNOTATED_PDF_ROOT), name="grading_annotated")

# 注册所有路由
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(ai_router)
app.include_router(sub1_router)
app.include_router(public_sub1_router)
app.include_router(sub2_router)
app.include_router(sub3_router)
app.include_router(sub4_router)
app.include_router(teacher_router)
app.include_router(grading_router)
app.include_router(ai_gateway_router)

# === 启动命令 ===
# 在根目录下终端运行：
# uvicorn backend.main:app --host 0.0.0.0 --port 5009 --reload