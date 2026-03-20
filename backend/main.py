import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import Config
from starlette.middleware.sessions import SessionMiddleware
# 导入路由
from backend.routes.auth_routes import auth_router
from backend.routes.admin_routes import admin_router
from backend.routes.ai_routes import ai_router
from backend.routes.sub1_routes import sub1_router
from backend.routes.sub2_routes import sub2_router
from backend.routes.sub4_routes import sub4_router

app = FastAPI(title="Intelligent Edu Platform API")
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

# 注册所有路由
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(ai_router)
app.include_router(sub1_router)
app.include_router(sub2_router)
app.include_router(sub4_router)

# === 启动命令 ===
# 在根目录下终端运行：
# uvicorn backend.main:app --host 0.0.0.0 --port 5009 --reload