# Intelligent Edu Platform

A full-stack education platform built with FastAPI (backend) and React + Vite (frontend).
It provides authentication, AI assistant workflows, chat, question generation, slide generation, grading workbench, email automation, and RAG-based retrieval.

---

## English Version

### 1. Overall Architecture

```text
Browser (React/Vite)
        |
        v
Nginx (production: static hosting + reverse proxy)
        |
        v
FastAPI (backend/main.py)
  |- routes/        -> API entry layer
  |- services/      -> business orchestration
  |- core/          -> config, security, database, dependencies
  |- schemas/       -> request/response models
  |- prompts/       -> AI prompt templates
  |- generated/uploads/md/highlights/static -> runtime artifacts
        |
        +--> MongoDB (users, metadata, sessions, indexes)
        +--> External AI providers (Ollama / Coze / DeepSeek / Zhipu)
        +--> Local file storage (PDF, annotations, generated output)
```

### 2. Top-Level Directory Structure And Purpose

```text
.
├─ backend/                # FastAPI backend application
├─ frontend/               # React + Vite frontend application
├─ data/                   # Demo courses, annotations, submissions, RAG eval data
├─ docs/                   # Technical and policy documentation
├─ deploy/                 # Dockerfiles and Nginx config
├─ pdf_loader/             # OpenDataLoader PDF subproject (Java/Node/Python)
├─ chart_prompts/          # Chart-related prompt assets
├─ tmp/                    # Temporary scripts and debug scripts
├─ docker-compose.yml      # Production-style compose (mongo + backend + nginx)
├─ pyproject.toml          # Python project/tooling config (pytest settings)
├─ run-backend.cmd         # One-click backend startup on Windows
└─ run-frontend.cmd        # One-click frontend startup on Windows
```

### 3. Backend Architecture (backend/)

- backend/main.py
  - FastAPI app bootstrap, middleware, CORS, session, rate limiting, global exception handling.
  - Registers routers and mounts static routes (/data, /test_pdf, /static, /grading_annotated).
  - Performs startup jobs (Mongo index ensure, temp cleanup, shared http client/process pool init).

- backend/config.py
  - Centralized environment configuration.
  - Security baseline checks (SECRET_KEY/JWT_SECRET_KEY strength, cookie settings).
  - Paths and runtime settings for uploads, AI provider, Gmail, RAG, and generated outputs.

- backend/core/
  - database.py: Mongo connection, health checks, index management.
  - security.py: auth/security utilities.
  - dependencies.py: FastAPI dependency wiring.
  - ai_provider.py: provider abstraction and switch logic.
  - safe_requests.py / utils.py: guarded HTTP helpers and shared utilities.

- backend/routes/
  - API boundary layer for request parsing, validation, and response contracts.
  - Key modules include auth, admin, ai, ai_gateway, chat, grading, teacher, slides,
    questions, study_notes, diagram, email, image_extractor.

- backend/services/
  - Business logic and orchestration layer.
  - Includes chat AI, search, grading, RAG pipelines, questions, slides, email,
    indexing jobs, transfer dispatch, and evaluation services.

- backend/schemas/
  - Pydantic models for typed request/response contracts.

- backend/prompts/
  - Prompt templates for chat, grading, email, and other AI tasks.

- backend/generated/, backend/uploads/, backend/md/, backend/highlights/, backend/static/
  - Runtime data and generated artifacts.

- backend/scripts/
  - Data migration, seeding, and evaluation scripts.

- backend/tests/
  - Backend automated tests.

### 4. Frontend Architecture (frontend/)

```text
frontend/
├─ src/
│  ├─ api/          # API clients and request wrappers
│  ├─ entries/      # app entry configurations
│  ├─ features/     # domain-oriented feature modules
│  ├─ shared/       # reusable cross-feature components/utilities
│  ├─ hooks/        # reusable React hooks
│  ├─ styles/       # style system
│  ├─ types/        # TypeScript and OpenAPI-generated types
│  ├─ utils/        # helper utilities
│  ├─ test/         # test utilities
│  └─ App.tsx/main.tsx
├─ scripts/         # OpenAPI sync and build helper scripts
└─ vite.config.js   # Vite build/dev configuration
```

Main feature domains in src/features/ include auth, chat, grading, mailbox, slides,
question-bank, study-notes, diagram, email-agent, image-extractor, admin,
admin-file-center, ai-interact, knowledge-base, study-room, and home.

### 5. Data / Docs / Deploy

- data/
  - courses.json: course/assignment demo metadata.
  - annotations/: persisted annotation data.
  - submissions/: sample submissions (for example, PDFs).
  - rag_eval/: RAG evaluation artifacts.

- docs/
  - COURSE_RAG_EVAL.md: RAG evaluation guide.
  - GRADING_PIPELINE_V2.md: grading workflow documentation.
  - DATA_RETENTION_POLICY.md: data retention policy.

- deploy/
  - Dockerfile.backend: backend container build.
  - Dockerfile.frontend: frontend + Nginx container build.
  - nginx.conf: reverse proxy and static serving config.

### 6. Local Development

Windows quick start (recommended):

```bat
run-backend.cmd
```

```bat
run-frontend.cmd
```

Default local addresses:
- Backend: http://127.0.0.1:8000
- Frontend: http://localhost:5173

Manual startup:

```bash
# Backend (from repo root)
python -m venv backend/venv
backend/venv/Scripts/pip install -r backend/requirements.txt
backend/venv/Scripts/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# Frontend
cd frontend
npm install
npm run dev
```

### 7. Docker Deployment (Production-Style)

The current docker-compose.yml runs mongo + backend + nginx.

```bash
docker compose build
docker compose up -d
```

Health checks:
- Backend: GET /api/health
- Nginx: GET /healthz
- Mongo: db.adminCommand('ping')

### 8. Testing And Quality

```bash
# Backend
pytest
```

```bash
# Frontend
cd frontend
npm run typecheck
npm run lint
npm run test:run
```

### 9. Notes

- In production, use strong random values for SECRET_KEY and JWT_SECRET_KEY.
- Configure ALLOWED_ORIGINS, MONGO_URI, and AI provider secrets via environment variables.
- AI capability can be switched by provider-related environment settings.

### 10. Single-Model RAG Deep Optimization (Local Ollama)

The backend chat pipeline now supports a retrieval-driven, single-model orchestration for student AI chat.

Implemented capabilities:
- Dual task profiles on the same Ollama model:
  - `light` profile for query rewrite / retrieval-intent stage.
  - `heavy` profile for final evidence-grounded answer.
- Two-stage chat flow:
  - Stage A: retrieval query rewrite.
  - Stage B: final answer generation using packed evidence.
- Empty retrieval retry:
  - If first retrieval is empty, the system retries once with rewritten query.
  - If still empty, returns an explicit insufficient-evidence response (no hallucinated answer).
- Evidence budgeting:
  - Retrieve a larger candidate pool and only pack top, deduplicated chunks within character budget.
- Post-check downgrade:
  - Unsupported claim-like sentences are downgraded to uncertain wording.
- Enhanced telemetry:
  - Adds retry flags, retrieval/answer latency, empty-after-retry signal, and post-check downgrade count.

Key configuration flags (backend/config.py):
- `RAG_TWO_STAGE_CHAT_ENABLED`
- `RAG_EMPTY_RETRY_ENABLED`
- `RAG_POSTCHECK_ENABLED`
- `RAG_RETRIEVE_TOP_N`
- `RAG_ANSWER_TOP_K`
- `RAG_EVIDENCE_MAX_CHARS`
- `RAG_EVIDENCE_MAX_CHARS_PER_CHUNK`
- `OLLAMA_LIGHT_TEMPERATURE`
- `OLLAMA_LIGHT_NUM_PREDICT`
- `OLLAMA_LIGHT_NUM_CTX`
- `OLLAMA_HEAVY_TEMPERATURE`
- `OLLAMA_HEAVY_NUM_PREDICT`
- `OLLAMA_HEAVY_NUM_CTX`

Quick verification commands:

```bash
# Targeted unit tests for the new single-model RAG pipeline
backend/venv/Scripts/python -m pytest backend/tests/test_rag_chat_pipeline.py backend/tests/test_local_llm_profiles.py -q

# Full backend tests
backend/venv/Scripts/python -m pytest backend/tests -q

# Retrieval evaluation (hybrid)
backend/venv/Scripts/python -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4

# Retrieval evaluation (vector-only)
backend/venv/Scripts/python -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4 --no-hybrid
```

---

## 繁體中文版本

### 1. 整體架構

```text
Browser (React/Vite)
        |
        v
Nginx（正式環境：靜態資源託管 + 反向代理）
        |
        v
FastAPI（backend/main.py）
  |- routes/        -> API 入口層
  |- services/      -> 業務編排層
  |- core/          -> 設定、安全、資料庫、依賴注入
  |- schemas/       -> 請求/回應模型
  |- prompts/       -> AI 提示詞模板
  |- generated/uploads/md/highlights/static -> 執行期產物
        |
        +--> MongoDB（使用者、元資料、會話、索引）
        +--> 外部 AI 供應商（Ollama / Coze / DeepSeek / Zhipu）
        +--> 本機檔案儲存（PDF、批註、生成結果）
```

### 2. 專案根目錄結構與功能

```text
.
├─ backend/                # FastAPI 後端主應用
├─ frontend/               # React + Vite 前端應用
├─ data/                   # 示範課程、批註、提交樣本、RAG 評測資料
├─ docs/                   # 技術與策略文件
├─ deploy/                 # Dockerfile 與 Nginx 設定
├─ pdf_loader/             # OpenDataLoader PDF 子專案（Java/Node/Python）
├─ chart_prompts/          # 圖表相關提示詞資源
├─ tmp/                    # 臨時腳本與除錯腳本
├─ docker-compose.yml      # 正式部署 compose（mongo + backend + nginx）
├─ pyproject.toml          # Python 工具/測試設定（pytest）
├─ run-backend.cmd         # Windows 一鍵啟動後端
└─ run-frontend.cmd        # Windows 一鍵啟動前端
```

### 3. 後端架構（backend/）

- backend/main.py
  - FastAPI 啟動入口，初始化中介層、CORS、Session、限流與全域例外處理。
  - 註冊所有路由，掛載靜態路徑（/data、/test_pdf、/static、/grading_annotated）。
  - 啟動時執行 Mongo 索引檢查、暫存檔清理、共享 http client/process pool 初始化。

- backend/config.py
  - 集中管理環境變數與執行設定。
  - 安全基線檢查（SECRET_KEY/JWT_SECRET_KEY 強度、Cookie 安全設定）。
  - 管理上傳、AI provider、Gmail、RAG、生成目錄等路徑與參數。

- backend/core/
  - database.py：Mongo 連線、健康檢查、索引管理。
  - security.py：驗證與安全相關工具。
  - dependencies.py：FastAPI 依賴注入。
  - ai_provider.py：AI provider 抽象與切換邏輯。
  - safe_requests.py / utils.py：安全請求封裝與共用工具。

- backend/routes/
  - API 邊界層，負責請求解析、校驗與回應契約。
  - 主要模組包含 auth、admin、ai、ai_gateway、chat、grading、teacher、slides、
    questions、study_notes、diagram、email、image_extractor。

- backend/services/
  - 業務邏輯與流程編排層。
  - 涵蓋聊天 AI、檢索、批改、RAG 流程、題目、投影片、郵件、索引任務與評測。

- backend/schemas/
  - 以 Pydantic 定義型別化請求/回應模型。

- backend/prompts/
  - 聊天、批改、郵件等 AI 任務提示詞模板。

- backend/generated/、backend/uploads/、backend/md/、backend/highlights/、backend/static/
  - 執行期間資料與生成產物儲存區。

- backend/scripts/
  - 資料遷移、種子資料、評測腳本。

- backend/tests/
  - 後端自動化測試。

### 4. 前端架構（frontend/）

```text
frontend/
├─ src/
│  ├─ api/          # API 客戶端與請求封裝
│  ├─ entries/      # 入口配置
│  ├─ features/     # 依業務域拆分的功能模組
│  ├─ shared/       # 跨功能共用元件/工具
│  ├─ hooks/        # 可重用 React Hooks
│  ├─ styles/       # 樣式系統
│  ├─ types/        # TypeScript 與 OpenAPI 生成型別
│  ├─ utils/        # 工具函式
│  ├─ test/         # 測試輔助
│  └─ App.tsx/main.tsx
├─ scripts/         # OpenAPI 同步與建置輔助腳本
└─ vite.config.js   # Vite 建置/開發設定
```

src/features/ 目前主要包含 auth、chat、grading、mailbox、slides、question-bank、study-notes、diagram、email-agent、image-extractor、admin、admin-file-center、ai-interact、knowledge-base、study-room、home 等功能域。

### 5. Data / Docs / Deploy 目錄

- data/
  - courses.json：課程與作業示範元資料。
  - annotations/：批註持久化資料。
  - submissions/：提交樣本（例如 PDF）。
  - rag_eval/：RAG 評測產物。

- docs/
  - COURSE_RAG_EVAL.md：RAG 評測說明。
  - GRADING_PIPELINE_V2.md：批改流程說明。
  - DATA_RETENTION_POLICY.md：資料保留政策。

- deploy/
  - Dockerfile.backend：後端映像建置。
  - Dockerfile.frontend：前端 + Nginx 映像建置。
  - nginx.conf：反向代理與靜態資源設定。

### 6. 本機開發

Windows 快速啟動（建議）：

```bat
run-backend.cmd
```

```bat
run-frontend.cmd
```

預設位址：
- 後端：http://127.0.0.1:8000
- 前端：http://localhost:5173

手動啟動：

```bash
# 後端（於專案根目錄）
python -m venv backend/venv
backend/venv/Scripts/pip install -r backend/requirements.txt
backend/venv/Scripts/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# 前端
cd frontend
npm install
npm run dev
```

### 7. Docker 部署（正式環境風格）

目前 docker-compose.yml 會啟動 mongo + backend + nginx。

```bash
docker compose build
docker compose up -d
```

健康檢查：
- Backend：GET /api/health
- Nginx：GET /healthz
- Mongo：db.adminCommand('ping')

### 8. 測試與品質檢查

```bash
# 後端
pytest
```

```bash
# 前端
cd frontend
npm run typecheck
npm run lint
npm run test:run
```

### 9. 備註

- 正式環境請務必使用高強度隨機 SECRET_KEY 與 JWT_SECRET_KEY。
- 建議透過環境變數設定 ALLOWED_ORIGINS、MONGO_URI 與 AI provider 金鑰。
- AI 能力可透過 provider 相關環境設定切換。

### 10. 單模型 RAG 深度優化（Local Ollama）

後端學生聊天鏈路已升級為「檢索驅動 + 單模型編排」模式。

已實作能力：
- 同一個 Ollama 模型的雙檔策略：
  - `light` 檔：Query Rewrite / 檢索意圖階段。
  - `heavy` 檔：最終證據導向回答階段。
- 兩階段問答流程：
  - 階段 A：先改寫檢索查詢。
  - 階段 B：基於證據打包內容生成最終回答。
- 空召回重試：
  - 第一次檢索為空時，會自動重試一次。
  - 若重試仍為空，回覆「證據不足」而非臆測答案。
- 證據預算控制：
  - 先擴大召回，再做去重與限額打包，只餵給高價值 chunk。
- 後驗降級：
  - 對缺乏證據支持的關鍵陳述降級為不確定語氣。
- Telemetry 增強：
  - 新增重試狀態、檢索/回答延遲、重試後空召回、後驗降級數量等指標。

主要配置項（backend/config.py）：
- `RAG_TWO_STAGE_CHAT_ENABLED`
- `RAG_EMPTY_RETRY_ENABLED`
- `RAG_POSTCHECK_ENABLED`
- `RAG_RETRIEVE_TOP_N`
- `RAG_ANSWER_TOP_K`
- `RAG_EVIDENCE_MAX_CHARS`
- `RAG_EVIDENCE_MAX_CHARS_PER_CHUNK`
- `OLLAMA_LIGHT_TEMPERATURE`
- `OLLAMA_LIGHT_NUM_PREDICT`
- `OLLAMA_LIGHT_NUM_CTX`
- `OLLAMA_HEAVY_TEMPERATURE`
- `OLLAMA_HEAVY_NUM_PREDICT`
- `OLLAMA_HEAVY_NUM_CTX`

快速驗證指令：

```bash
# 新增單模型 RAG 編排測試
backend/venv/Scripts/python -m pytest backend/tests/test_rag_chat_pipeline.py backend/tests/test_local_llm_profiles.py -q

# 全量後端測試
backend/venv/Scripts/python -m pytest backend/tests -q

# 檢索評測（Hybrid）
backend/venv/Scripts/python -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4

# 檢索評測（Vector only）
backend/venv/Scripts/python -m backend.scripts.eval_course_rag --dataset data/rag_eval/course_rag_eval.jsonl --top-k 4 --no-hybrid
```
