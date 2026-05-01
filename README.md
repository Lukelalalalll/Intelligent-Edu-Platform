# Intelligent Edu Platform

## Project Overview
Intelligent Edu Platform is a comprehensive, full-stack educational system designed to provide AI-powered learning assistance. The platform integrates a Retrieval-Augmented Generation (RAG) educational chatbot, a document-based knowledge indexing system, an AI grading workbench, and capabilities for automated slide and lecture video generation.

## Technical Architecure
- **Backend:** FastAPI, Python 3.11+, MongoDB (Motor), ChromaDB, LangChain.
- **Frontend:** React 18, TypeScript, Vite, Zustand.
- **Deployment:** Docker Compose, Nginx.

---

## 1. Prerequisites
Before starting, ensure the following tools are installed on your machine:
- Python 3.11 or greater
- Node.js 18 or greater (LTS recommended)
- npm (Node Package Manager)
- MongoDB 7.0+ (running locally at mongodb://localhost:27017 or via Docker)

---

## 2. Project Setup & Configuration

### Environment Variables
1. At the root of the project, create the main backend environment file by copying the given template (or manually create `.env` if none exists).
     cp .env.example .env

2. Navigate to the `frontend/` directory and create the frontend environment file.
     cp frontend/.env.example frontend/.env

3. Ensure the frontend config `frontend/.env` points to the local backend properly:
     VITE_API_ROOT=http://localhost:5009

### Database Configuration (MongoDB)
If you have Docker installed, the easiest way to start MongoDB is by running:
     docker compose up -d mongo

Alternatively, if you already have a local MongoDB daemon installed and running on port 27017, no additional steps correspond to the database setup. Just ensure that the `MONGO_URI` in the root `.env` file matches your local database instance (e.g., `mongodb://localhost:27017/edu_platform`).

---

## 3. Running the Application Locally (Development Mode)

You will need two terminal windows: one to run the backend server and another to build and serve the frontend web application.

### A) Start the Backend Server
Open a terminal at the project root and run the following commands:
1. Create a Python Virtual Environment:
     python -m venv backend/venv

2. Activate the Virtual Environment:
     # For macOS and Linux:
     source backend/venv/bin/activate
     
     # For Windows:
     backend\venv\Scripts\activate

3. Install the Required Python Dependencies:
     pip install -r backend/requirements.txt

4. Start the Application:
     python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5009

The backend will start and listen on port 5009. You can verify it's running by navigating to: http://localhost:5009/api/health

### B) Start the Frontend Client
Open a second terminal, navigate to the `frontend` folder, and run:
1. Move to the frontend directory:
     cd frontend

2. Install Node dependencies:
     npm install

3. Start the Vite development server:
     npm run dev

The web interface will automatically be hosted and served. Open your web browser and navigate to the local address provided by Vite (usually http://localhost:5173).

---

## 4. Running via Docker (Production Simulation)

If you prefer to run the entire stack (Frontend, Backend, and MongoDB) via Docker containers, you can use the provided Docker Compose configuration.

1. Setup the required Docker environment files first:
     cp backend/.env.production backend/.env
     cp frontend/.env.production frontend/.env

2. Build and start the containers in detached mode:
     docker compose up --build -d

3. The application is now served behind an Nginx proxy. You can access the main frontend UI locally by navigating to: `http://localhost`

## 5. Notes on the Video & Slide Generation Module
The application automatically generates educational videos out of slides by leveraging Playwright to take screenshots of the rendered React components.
- In local development mode, this relies on the frontend application (`npm run dev`) currently running, pointing Playwright to `http://127.0.0.1:5173/slide-renderer`.
- If the browser interface is not reachable, the backend will automatically and safely fallback to generating static images via Pillow.

**正式環境：**
在後端設定 `SLIDE_RENDERER_URL` 環境變數，指向已建置的前端服務：
```env
SLIDE_RENDERER_URL=http://frontend:4173/slide-renderer
```
Docker Compose 部署時由 `frontend` 服務執行 `vite preview` 自動處理。

**自動降級：**
若前端無法連線，後端會自動切換至 Pillow 圖像渲染作為備援。

### 常見問題
- 前端打不到後端：先檢查 `frontend/.env` 的 `VITE_API_ROOT`。
- 後端連不上資料庫：檢查 `MONGO_URI` 與 MongoDB 狀態。
- AI 功能失敗：檢查 `.env` 內各 provider 的 key/token 是否正確。
- 生成的影片投影片與預覽不一致：確認前端正在執行，且後端可連線至 `SLIDE_RENDERER_URL`。
