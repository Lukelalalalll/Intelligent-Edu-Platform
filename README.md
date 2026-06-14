# Intelligent Edu Platform

## Project Overview
Intelligent Edu Platform is a comprehensive, full-stack educational system designed to provide AI-powered learning assistance. The platform integrates a Retrieval-Augmented Generation (RAG) educational chatbot, a document-based knowledge indexing system, an AI grading workbench, and capabilities for automated slide and lecture video generation.

## Technical Architecture
- **Backend:** FastAPI, Python 3.11 / 3.12, MongoDB (Motor), ChromaDB, LangChain.
- **Frontend:** React 18, TypeScript, Vite, Zustand.
- **Deployment:** Docker Compose, Nginx.

---

## 1. Prerequisites
Before starting, ensure the following tools are installed on your machine:
- **Python 3.11 or 3.12** *(⚠️ Important: Do not use Python 3.13 as some machine learning dependencies like `shapely` lack precompiled wheels and will fail to build).*
- **Node.js 18 or greater** (LTS recommended)
- **npm** (Node Package Manager)
- **MongoDB 7.0+** (running locally at `mongodb://localhost:27017` or via Docker)
- **OpenSearch 3.x** *(optional, but recommended for enterprise-grade RAG sparse / metadata retrieval)*

---

## 2. Project Setup & Configuration

### Environment Variables
You need to set up environment variables for both the backend and frontend.

1. **Backend Config:**
   At the root of the project, create the main `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
   *Open `.env` and fill in your API keys (e.g., Coze / Local Ollama URLs, Google OAuth endpoints, etc.).*

2. **Frontend Config:**
   Navigate to the `frontend/` directory and do the same:
   ```bash
   cd frontend
   cp .env.example .env
   cd ..
   ```
   *Ensure the `frontend/.env` points to the local backend API (default is usually `VITE_API_ROOT=http://localhost:5009`).*

### Database Configuration (MongoDB)
If you have Docker installed, you can simply spin up a MongoDB instance using:
```bash
docker compose up -d mongo
```
*(If you are running MongoDB locally without Docker, just make sure `MONGO_URI` in the root `.env` matches your address, e.g., `mongodb://localhost:27017/edu_platform`).*

### Search Infrastructure Configuration (Optional OpenSearch for RAG)
If you want to enable the enterprise sparse / metadata retrieval path for RAG, set the following in the root `.env`:

```env
RAG_OPENSEARCH_ENABLED=true
RAG_OPENSEARCH_ENDPOINT=http://127.0.0.1:9200
RAG_OPENSEARCH_INDEX_PREFIX=course-rag
RAG_OPENSEARCH_VERIFY_CERTS=false
```

For the local Windows setup already prepared in this repository, see:
`infra/opensearch/README-local.md`

### AI Provider Configuration (Local Ollama on Windows)
If you are deploying a local Large Language Model via Ollama on a **separate Windows machine**, you must configure Windows to allow local network access, and subsequently update the backend configuration.

1. **Allow External Access to Ollama (Windows)**:
   By default, Ollama only listens to `localhost`. To let your macOS backend connect to it:
   - Right-click the **Ollama icon** in the Windows taskbar tray and choose **Quit Ollama**.
   - Press `Win + R`, type `sysdm.cpl`, hit Enter, then switch to the **Advanced** tab and click **Environment Variables**.
   - Under "System variables" or "User variables", click **New**:
     - **Variable name**: `OLLAMA_HOST`
     - **Variable value**: `0.0.0.0`
   - Click **OK** to save. Restart Ollama. It will now accept connections from other computers on your local network.

2. **Retrieve Windows IP Address**:
   - Open Command Prompt on Windows (`cmd`), run `ipconfig`, and take note of the **IPv4 Address** (e.g., `192.168.1.100`).

3. **Update Backend Configuration**:
   - Open the `backend/core/config.py` file in this project.
   - Around line 78, change the `OLLAMA_BASE_URL` to point to your Windows IP address:
```python
# backend/core/config.py
OLLAMA_BASE_URL: str = "http://<YOUR_WINDOWS_IPv4_ADDRESS>:11434"
```
   *(Wait for the backend server to restart, or manually restart it for changes to apply).*

---

## 3. Running the Application Locally (Development Mode)

You will need **two terminal windows**: one for the backend server and another for the frontend web application.

### A) Start the Backend Server (Terminal 1)
Open a terminal at the project root and run the following commands:

1. **Create a Python Virtual Environment**:
   ```bash
   python -m venv backend/venv
   ```

2. **Activate the Virtual Environment**:
   - For macOS and Linux:
     ```bash
     source backend/venv/bin/activate
     ```
   - For Windows:
     ```bash
     backend\venv\Scripts\activate
     ```

3. **Install Python Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Start OpenSearch (recommended for RAG development)**:
   - For Windows PowerShell:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\infra\opensearch\start-opensearch-dev.ps1
     ```
   - Verify status:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\infra\opensearch\status-opensearch-dev.ps1
     ```
   *This step is optional for general backend work, but recommended if you are developing or testing the RAG retrieval stack.*

5. **Start the Application**:
   ```bash
   python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5009
   ```
   *The backend is now running at `http://localhost:5009`. You can verify by visiting: `http://localhost:5009/api/health`*

### B) Start the Frontend Client (Terminal 2)
Open a second terminal at the project root and run:

1. **Move to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   *The web interface will be served at `http://localhost:5173`. Open this URL in your browser.*

---

## 4. Running via Docker (Production Simulation)

If you prefer to run the entire stack (Frontend, Backend, MongoDB) via Docker, use the provided Docker Compose configuration.

1. **Setup backend environment files**:
   ```bash
   cp backend/.env.shared.example backend/.env.shared
   cp backend/.env.core.example backend/.env.core
   ```
   Fill in real production values for `ALLOWED_ORIGINS`, `SECRET_KEY`, `JWT_SECRET_KEY`, and any AI / OAuth credentials you use.

2. **Create a secure Compose env file outside the repo**:
   Use [`deploy/compose.production.env.example`](deploy/compose.production.env.example) as a template and save the real file somewhere outside the repository, for example `/secure/path/compose.prod.env`.

3. **Build and start the containers**:
   ```bash
   docker compose --env-file /secure/path/compose.prod.env up --build -d
   ```
   `INTERNAL_GATEWAY_TOKEN` and `SEARXNG_SECRET_KEY` are required. `docker compose config` will fail fast if they are missing.

4. Access the main UI locally by navigating to: `http://localhost`

Only the `edge-nginx` entrypoint is published to the host. Backend services, MongoDB, and SearXNG stay on internal Docker networks.

---

## 5. Deploying to Vercel (Hybrid Architecture)

To deploy the frontend and backend to Vercel while keeping the AI models (Ollama) local on your personal machine, you will need a hybrid cloud-local setup using Ngrok/Cloudflare Tunnels and a MongoDB cloud database. 

👉 **Read the comprehensive guide here:** [docs/VERCEL_DEPLOYMENT_GUIDE.md](docs/VERCEL_DEPLOYMENT_GUIDE.md)

---

## 7. Notes on the Video & Slide Generation Module
The application automatically generates educational videos out of slides by leveraging Playwright to take screenshots of the rendered React components, ensuring the final video visually matches the browser preview exactly.

**Local Development:**
Before triggering a video generation, ensure the frontend is running (`npm run dev`). Playwright will connect to:
`http://127.0.0.1:5173/slide-renderer`

**Production Environment:**
Configure the `SLIDE_RENDERER_URL` environment variable on the backend to point to the built frontend service:
```env
SLIDE_RENDERER_URL=http://edge-nginx:8080/slide-renderer
```
In the Docker stack, the renderer page is served by `edge-nginx` on the internal ingress network.
When deploying using Docker Compose, the frontend bundle is served by `edge-nginx` and `/slide-renderer` stays available on the internal ingress network.

**Automatic Fallback:**
If the frontend service is unreachable, the backend will automatically fallback to Pillow-based static image rendering.

---

## 8. Troubleshooting FAQs

- **"Building wheel for accumulation-tree ... error" during `pip install`**:
  You are likely using Python 3.13. Please downgrade to Python 3.11 or 3.12, delete the `backend/venv` folder, and recreate the virtual environment.
- **Frontend cannot connect to the backend**:
  Verify the value of `VITE_API_ROOT` in the `frontend/.env` file. It should properly point to your backend server address (e.g., `http://localhost:5009`).
- **Backend cannot connect to the database**:
  Verify the `MONGO_URI` in the `.env` file and ensure your MongoDB instance or Docker container is running properly.
- **AI functionalities are failing**:
  Double-check the `backend/core/config.py` and `.env` file to ensure API keys (`COZE_API_KEY`) and URLs (`OLLAMA_BASE_URL`) for your chosen AI providers are correctly configured.
- **Generated video slides look different from the browser preview**:
  Ensure the frontend service is actively running and the backend can successfully reach the `SLIDE_RENDERER_URL`.

---

## 9. Project Directory Structure

Understanding the project's layout is crucial for further development and maintenance. Below is an overview of the core structure and module responsibilities, following commercial delivery standards:

```text
Intelligent-Edu-Platform/
├── backend/               # FastAPI core backend service
│   ├── core/              # Global configs, DB connections, AI provider integration
│   ├── routes/            # REST API endpoints (grading, homework, sessions)
│   ├── repositories/      # Database abstraction layer (MongoDB interactions)
│   ├── services/          # Core business logic processing
│   ├── prompts/           # LLM agent system prompts and behavior templates
│   └── main.py            # FastAPI application entry point
├── frontend/              # React 18 Web application interface (Vite)
│   ├── src/               # UI components, TypeScript logic, and Zustand state
│   ├── public/            # Static configuration and assets
│   └── package.json       # Node.js dependency configuration
├── Wav2Lip/               # Core AI video generation & lip-syncing algorithms
│   ├── checkpoints/       # Pretrained machine learning models/weights
│   └── inference.py       # Audio-video synchronization entry script
├── deploy/                # Deployment and orchestration infrastructure
│   ├── Dockerfile.*       # Build instructions for isolated microservices
│   ├── nginx.conf         # Load balancing and reverse proxy routing
│   └── searxng/           # Native web-search integration configurations
├── data/                  # Static application seeds (default courses, slide themes)
├── docs/                  # Architecture decisions, refactoring plans, and tech specs
├── evaluator/             # Validation scripts/datasets for RAG & LLM performance
├── pdf_loader/            # Specialized parsers for knowledge base document extraction
├── docker-compose.yml     # Local multi-container orchestration configuration
├── pyproject.toml         # Python tooling and ecosystem configuration
├── locustfile.py          # Load-testing and performance benchmarking scripts
└── README.md              # Project onboarding and operation manual
```

---

# 中文版初始化运行教程

## 项目概述
Intelligent Edu Platform 是一个功能全面的全栈教育系统，旨在提供 AI 驱动的学习辅助。平台集成了 RAG（检索增强生成）教育聊天机器人、基于文档的知识索引系统、AI 批改工作台，以及自动生成课件幻灯片和讲课视频的功能。

## 技术架构
- **后端:** FastAPI、Python 3.11 / 3.12、MongoDB (Motor)、ChromaDB、LangChain
- **前端:** React 18、TypeScript、Vite、Zustand
- **部署:** Docker Compose、Nginx

---

## 1. 环境准备

在开始之前，请确保你的机器上已安装以下工具：

- **Python 3.11 或 3.12** *（⚠️ 重要提示：请勿使用 Python 3.13。某些机器学习依赖项如 `shapely` 在 3.13 中没有预编译的 wheel，会导致构建失败。）*
- **Node.js 18 或更高版本**（建议使用 LTS 版本）
- **npm**（Node 包管理器）
- **MongoDB 7.0+**（本地运行在 `mongodb://localhost:27017`，或通过 Docker 运行）
- **OpenSearch 3.x**（可选，但如果你要做企业级 RAG 稀疏检索 / 元数据检索，建议启用）

---

## 2. 项目配置

### 环境变量

你需要为后端和前端分别配置环境变量。

1. **后端配置：**
   在项目根目录下，基于模板创建主 `.env` 文件：
   ```bash
   cp .env.example .env
   ```
   *打开 `.env` 文件，填入你自己的 API 密钥（例如 Coze / 本地 Ollama URL、Google OAuth 端点等）。*

2. **前端配置：**
   进入 `frontend/` 目录，同样创建：
   ```bash
   cd frontend
   cp .env.example .env
   cd ..
   ```
   *确保 `frontend/.env` 中的 `VITE_API_ROOT` 指向本地后端 API（默认值为 `http://localhost:5009`）。*

### 数据库配置（MongoDB）

如果你已安装 Docker，可以直接启动一个 MongoDB 实例：
```bash
docker compose up -d mongo
```
*（如果你不使用 Docker，而是本地运行 MongoDB，确保根目录 `.env` 中的 `MONGO_URI` 与你本地地址一致，例如 `mongodb://localhost:27017/edu_platform`）。*

### 搜索基础设施配置（可选 OpenSearch，用于 RAG）

如果你要启用企业级稀疏检索 / 元数据检索链路，请在根目录 `.env` 中加入：

```env
RAG_OPENSEARCH_ENABLED=true
RAG_OPENSEARCH_ENDPOINT=http://127.0.0.1:9200
RAG_OPENSEARCH_INDEX_PREFIX=course-rag
RAG_OPENSEARCH_VERIFY_CERTS=false
```

如果你使用的是本仓库已经准备好的本机 Windows OpenSearch 方案，可参考：
`infra/opensearch/README-local.md`

### AI 提供商配置（Windows 本地 Ollama）

如果你在**单独的 Windows 机器**上通过 Ollama 部署本地大语言模型，你需要配置 Windows 以允许局域网访问，然后更新后端配置。

1. **允许 Ollama 外部访问（Windows）：**
   默认情况下，Ollama 仅监听 `localhost`。要让 macOS 后端能够连接到它：
   - 右键单击 Windows 任务栏托盘中的 **Ollama 图标**，选择 **Quit Ollama**。
   - 按下 `Win + R`，输入 `sysdm.cpl`，回车，切换到 **高级** 选项卡，点击 **环境变量**。
   - 在"系统变量"或"用户变量"区域，点击 **新建**：
     - **变量名**：`OLLAMA_HOST`
     - **变量值**：`0.0.0.0`
   - 点击 **确定** 保存。重启 Ollama。现在它就能接收来自局域网内其他计算机的连接了。

2. **获取 Windows IP 地址：**
   - 在 Windows 上打开命令提示符（`cmd`），运行 `ipconfig`，记下 **IPv4 地址**（例如 `192.168.1.100`）。

3. **更新后端配置：**
   - 打开项目中的 `backend/core/config.py` 文件。
   - 在第 78 行附近，将 `OLLAMA_BASE_URL` 修改为你的 Windows IP 地址：
   ```python
   # backend/core/config.py
   OLLAMA_BASE_URL: str = "http://<你的Windows_IPv4地址>:11434"
   ```
   *（等待后端服务器重启，或手动重启使配置生效）。*

---

## 3. 本地开发模式运行

你需要打开**两个终端窗口**：一个运行后端服务，另一个运行前端应用。

### A) 启动后端服务（终端 1）

在项目根目录打开终端，依次执行以下命令：

1. **创建 Python 虚拟环境**：
   ```bash
   python -m venv backend/venv
   ```

2. **激活虚拟环境**：
   - macOS 和 Linux：
     ```bash
     source backend/venv/bin/activate
     ```
   - Windows：
     ```bash
     backend\venv\Scripts\activate
     ```

3. **安装 Python 依赖**：
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **启动 OpenSearch（建议做 RAG 开发时先启动）**：
   - Windows PowerShell：
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\infra\opensearch\start-opensearch-dev.ps1
     ```
   - 查看状态：
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\infra\opensearch\status-opensearch-dev.ps1
     ```
   *这一步对普通后端开发不是强制的，但如果你要调试或评测 RAG 检索链路，建议先启动。*

5. **启动应用**：
   ```bash
   python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5009
   ```
   *后端现已运行在 `http://localhost:5009`。你可以访问 `http://localhost:5009/api/health` 进行验证。*

### B) 启动前端客户端（终端 2）

在项目根目录打开第二个终端，依次执行：

1. **进入前端目录**：
   ```bash
   cd frontend
   ```

2. **安装 Node 依赖**：
   ```bash
   npm install
   ```

3. **启动 Vite 开发服务器**：
   ```bash
   npm run dev
   ```
   *前端页面将在 `http://localhost:5173` 提供访问。在浏览器中打开此地址即可。*

---

## 4. Docker 部署（生产模式模拟）

如果你想通过 Docker 运行整个技术栈（前端、后端、MongoDB），使用项目提供的 Docker Compose 配置。

1. **设置生产环境文件**：
   ```bash
   cp backend/.env.production backend/.env
   cp frontend/.env.production frontend/.env
   ```

2. **构建并启动容器**：
   ```bash
   docker compose up --build -d
   ```

3. 在浏览器中访问 `http://localhost` 即可进入主界面。

---

## 5. Vercel 部署（混合架构）

要将前端和后端部署到 Vercel，同时将 AI 模型（Ollama）保留在本地机器上，你需要通过 Ngrok/Cloudflare Tunnel 和 MongoDB 云数据库组建混合云-本地架构。

👉 **完整部署指南：** [docs/VERCEL_DEPLOYMENT_GUIDE.md](docs/VERCEL_DEPLOYMENT_GUIDE.md)

---

## 6. 视频与幻灯片生成模块说明

应用通过 Playwright 截取 React 组件渲染后的画面，利用幻灯片自动生成教学视频，确保最终视频画面与浏览器预览效果完全一致。

**本地开发环境：**
触发视频生成前，请确保前端已启动（`npm run dev`）。Playwright 将连接到：
`http://127.0.0.1:5173/slide-renderer`

**生产环境：**
在后端配置 `SLIDE_RENDERER_URL` 环境变量，指向已构建的前端服务：
```env
SLIDE_RENDERER_URL=http://edge-nginx:8080/slide-renderer
```
In the Docker stack, the renderer page is served by `edge-nginx` on the internal ingress network.
使用 Docker Compose 部署时，前端静态资源由 `edge-nginx` 提供，`/slide-renderer` 会继续在内部 ingress 网络上可用。

**自动回退：**
如果前端服务不可达，后端将自动回退到基于 Pillow 的静态图像渲染。

---

## 7. 常见问题排查

- **`pip install` 时出现 "Building wheel for accumulation-tree ... error" 错误**：
  你很可能使用了 Python 3.13。请降级到 Python 3.11 或 3.12，删除 `backend/venv` 文件夹，然后重新创建虚拟环境。
- **前端无法连接后端**：
  检查 `frontend/.env` 文件中 `VITE_API_ROOT` 的值。它应该正确指向你的后端服务地址（例如 `http://localhost:5009`）。
- **后端无法连接数据库**：
  检查根目录 `.env` 中的 `MONGO_URI`，确保 MongoDB 实例或 Docker 容器正在正常运行。
- **AI 功能无法使用**：
  仔细检查 `backend/core/config.py` 和 `.env` 文件，确保 AI 提供商的 API 密钥（`COZE_API_KEY`）和 URL（`OLLAMA_BASE_URL`）配置正确。
- **生成的视频幻灯片与浏览器预览不一致**：
  确保前端服务正在运行，且后端能成功访问 `SLIDE_RENDERER_URL`。
