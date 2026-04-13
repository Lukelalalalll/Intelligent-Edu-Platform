# Backend Architecture — Detailed Reference

---

## Overview

The backend is a **FastAPI 0.135 + Python 3.11** application. It uses **MongoDB with Motor** (async driver) for all persistence, **JWT in HttpOnly cookies** for auth, and a layered route → service → database pattern. It runs on **Uvicorn** and is containerized with Docker.

---

## 1. Application Entry & Startup

```
  backend/main.py

  ┌──────────────────────────────────────────────────────────────────────┐
  │  FastAPI app = FastAPI(title="Intelligent-Edu-Platform")             │
  │                                                                      │
  │  @app.on_event("startup"):                                           │
  │  ─────────────────────────                                           │
  │  1. Connect Motor → MongoDB                                          │
  │  2. Create MongoDB indexes (users, courses, chat_messages, etc.)     │
  │  3. Load AI provider config (resolve_provider())                     │
  │  4. Start background RAG indexing job watcher                        │
  │                                                                      │
  │  @app.on_event("shutdown"):                                          │
  │  ──────────────────────────                                          │
  │  1. Close Motor connection                                           │
  │  2. Flush telemetry buffer                                           │
  └──────────────────────────────────────────────────────────────────────┘

  Middleware stack (applied in order):
  ┌─────────────────────────────────────────────────────────────────────┐
  │  1. TrustedHostMiddleware       ← ALLOWED_HOSTS list                │
  │  2. CORSMiddleware              ← origins, credentials=True         │
  │  3. HTTPSRedirectMiddleware     ← production only                   │
  │  4. GZipMiddleware              ← compress responses > 1KB          │
  │  5. Custom RequestIDMiddleware  ← adds X-Request-ID header          │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Route Layer Map

```
  backend/routes/
  ├── auth_routes/
  │   ├── router.py          GET /api/auth/me
  │   ├── local.py           POST /api/auth/login, /register, /logout, /refresh
  │   └── google.py          GET  /api/auth/google/init
  │                          POST /api/auth/google/callback
  │
  ├── chat_routes/
  │   ├── router.py          ← ConnectionManager + broadcast helpers
  │   ├── ws.py              WS  /api/chat/ws
  │   ├── rooms.py           GET/POST /api/chat/rooms
  │   │                      POST /api/chat/rooms/direct
  │   │                      GET  /api/chat/rooms/{roomId}
  │   ├── messages.py        GET  /api/chat/messages/{roomId}
  │   │                      POST /api/chat/messages/mark-read
  │   │                      DELETE /api/chat/messages/{msgId}
  │   │                      POST /api/chat/messages/{msgId}/recall
  │   ├── contacts.py        GET  /api/chat/contacts
  │   │                      GET  /api/chat/contacts/search
  │   │                      POST /api/chat/contacts/add
  │   │                      POST /api/chat/contacts/accept
  │   └── ai_actions.py      POST /api/chat/ai/summarise
  │                          POST /api/chat/ai/suggest-reply
  │
  ├── ai_routes/
  │   ├── chat.py            POST /api/ai/chat  (RAG-grounded assistant, SSE)
  │   ├── history.py         GET  /api/ai/history
  │   └── router.py
  │
  ├── ai_gateway_routes/
  │   ├── direct.py          POST /api/gateway/chat  (ungrounded AI, SSE)
  │   └── router.py
  │
  ├── courses/               ← implicitly: course CRUD
  │   GET/POST /api/courses
  │   GET/PUT/DELETE /api/courses/{id}
  │   POST /api/courses/{id}/enroll
  │
  ├── grading_routes.py      POST /api/grading/grade  (SSE)
  │                          GET  /api/grading/results/{submissionId}
  │
  ├── slides_routes/
  │   POST /api/slides/generate  (SSE)
  │
  ├── video_routes.py        POST /api/video/generate
  │                          GET  /api/video/status/{jobId}  (SSE)
  │                          GET  /api/video/file/{jobId}
  │
  ├── study_notes_routes.py  POST /api/study-notes/generate  (SSE)
  │
  ├── email_routes.py        POST /api/email/draft  (SSE)
  │
  ├── homework_routes.py     GET/POST /api/homework
  │                          POST /api/homework/{id}/submit
  │
  ├── questions_routes/      GET/POST /api/questions
  │
  ├── diagram_routes.py      POST /api/diagram/generate
  │
  ├── image_extractor_routes.py  POST /api/image/extract  (vision OCR)
  │
  ├── mailbox_routes.py      GET/POST /api/mailbox  (Gmail integration)
  │
  ├── diagnostic_routes.py   GET /api/diagnostic/health
  │                          GET /api/diagnostic/db
  │
  └── admin_routes/
      GET/POST /api/admin/users
      DELETE   /api/admin/users/{id}
      GET      /api/admin/llm-stats
      GET      /api/admin/ai-providers/health
```

---

## 3. Service Layer

```
  backend/services/
  ├── auth_service.py              ← JWT create/verify, password hashing
  ├── user_service.py              ← user CRUD, profile update
  ├── course_service.py            ← course CRUD, enrollment
  │
  ├── ai_gateway_service.py        ← Coze API (cloud LLM)
  ├── local_llm_service.py         ← Ollama (local LLM)
  ├── chat_streaming.py            ← SSE stream builder
  │
  ├── course_rag_service/          ← RAG orchestration
  │   ├── service.py               ← main RAG query handler
  │   ├── chunking.py              ← LangChain text splitter config
  │   ├── retrieval_helpers.py     ← ChromaDB + TF-IDF + RRF merge
  │   └── types.py                 ← RetrievedChunk, RagContext types
  │
  ├── vector_rag_service.py        ← ChromaDB low-level ops
  ├── tfidf_rag_service.py         ← TF-IDF index (in-memory)
  ├── rag_orchestrator.py          ← decides teacher vs student mode
  ├── indexing_job_service.py      ← background PDF indexing jobs
  │
  ├── grading_service.py           ← rubric-based LLM grading
  │
  ├── video_service/               ← video generation pipeline
  │   ├── pipeline.py              ← main orchestrator
  │   ├── script.py                ← AI script generation
  │   ├── tts.py                   ← edge-TTS audio synthesis
  │   ├── render.py                ← Playwright/Pillow slide render
  │   └── compose.py               ← FFmpeg clip + concat
  │
  ├── slides_service.py            ← AI slide deck generation
  ├── study_notes_service.py       ← AI note generation
  ├── email_service.py             ← AI email drafting
  ├── homework_service.py          ← homework CRUD + submission
  ├── questions_service.py         ← question bank CRUD
  └── mailbox_service.py           ← Gmail OAuth + read/send
```

---

## 4. Security & Authentication

```
  Auth model: JWT in HttpOnly Cookies
  ─────────────────────────────────────────────────────────────────────
  Access token:   15-minute lifetime, HttpOnly, SameSite=Lax
  Refresh token:  7-day lifetime,  HttpOnly, SameSite=Lax, Path=/api/auth/refresh

  Tokens contain:  { sub: user_id, role: "student"|"teacher"|"admin",
                     jti: uuid4(), exp: unix_timestamp }

  JTI blocklist:   revoked tokens stored in MongoDB `token_blocklist`
                   checked on every request to support logout

  core/security.py:
  ┌──────────────────────────────────────────────────────────────────┐
  │  create_access_token(user_id, role)  → signed JWT string        │
  │  verify_token(token) → payload dict  (raises 401 if invalid)    │
  │  hash_password(plain) → bcrypt hash                             │
  │  verify_password(plain, hashed) → bool                          │
  └──────────────────────────────────────────────────────────────────┘

  core/dependencies.py:
  ┌──────────────────────────────────────────────────────────────────┐
  │  get_current_user   ← reads cookie, verifies JWT, returns User  │
  │  require_teacher    ← get_current_user + role check             │
  │  require_admin      ← get_current_user + role check             │
  │                                                                  │
  │  Usage in routes:                                                │
  │  async def endpoint(user = Depends(get_current_user)):           │
  └──────────────────────────────────────────────────────────────────┘

  CORS config (main.py):
  ┌──────────────────────────────────────────────────────────────────┐
  │  allow_origins     = ["http://localhost:5173",                  │
  │                        "https://yourdomain.com"]                │
  │  allow_credentials = True    ← required for HttpOnly cookies    │
  │  allow_methods     = ["*"]                                       │
  │  allow_headers     = ["*"]                                       │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 5. MongoDB Collections

```
  Database: mongodb://... (MONGO_URI from .env)
  Database name: edu_platform

  ┌──────────────────────┬──────────────────────────────────────────────┐
  │  Collection           │  Purpose                                    │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │  users               │  accounts: email, hashed_pwd, role, profile  │
  │  courses             │  course data, enrolled_students[], teacherId  │
  │  course_materials    │  uploaded PDFs/docs per course               │
  │  rag_index_jobs      │  indexing job status (pending/done/failed)   │
  │  chat_rooms          │  IM room definitions (type, members, last_msg)│
  │  chat_messages       │  all messages (readBy[], deletedFor[], etc.)  │
  │  friend_requests     │  pending/accepted friend connections         │
  │  homework            │  assignments + student submissions           │
  │  questions           │  question bank entries per course            │
  │  grading_results     │  rubric breakdown + LLM scores per sub       │
  │  llm_usage_logs      │  token/latency telemetry per LLM call        │
  │  rag_retrieval_logs  │  RAG query telemetry                         │
  │  token_blocklist     │  revoked JWT JTI values (logout)             │
  │  ai_chat_history     │  ai/chat conversation history per user       │
  │  study_notes         │  saved study note docs per user/course       │
  │  slides              │  saved slide decks                           │
  └──────────────────────┴──────────────────────────────────────────────┘

  Key indexes:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  users:          { email: 1 }           unique                       │
  │  chat_messages:  { roomId: 1, sentAt: -1 }                          │
  │  chat_messages:  { roomId: 1, readBy: 1 }  ← for unread aggregation │
  │  rag_index_jobs: { courseId: 1, status: 1 }                         │
  │  token_blocklist:{ jti: 1 }             unique, TTL                  │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 6. RAG Knowledge System Flow

```
  (See ARCH_RAG.md for full details)

  PDF Upload:
  POST /api/courses/{id}/materials  → indexing_job_service schedules job
  Background: PyMuPDF parse → LangChain chunk → HuggingFace embed → ChromaDB

  RAG Query:
  POST /api/ai/chat { courseId, query } → SSE stream
  ChromaDB semantic search + TF-IDF lexical search → RRF merge → LLM answer
```

---

## 7. Static Files & Uploads

```
  backend/
  ├── uploads/         ← user uploads: PDFs, avatars, homework files
  │                    Served at: GET /api/uploads/{filename}
  │                    FastAPI StaticFiles mount
  │
  ├── static/          ← misc static assets
  │
  └── generated/       ← AI-generated outputs
      ├── videos/      ← video generation output ({jobId}/final.mp4)
      ├── slides/      ← exported slide decks
      ├── vectorstore/ ← ChromaDB persistent storage (per-course)
      └── highlights/  ← PDF text highlights exports

  File size limits (config.py):
    MAX_UPLOAD_SIZE      = 50 MB
    MAX_VIDEO_DURATION   = 10 minutes
    ALLOWED_EXTENSIONS   = {".pdf", ".png", ".jpg", ".jpeg", ".docx"}
```

---

## 8. Configuration System

```
  backend/config.py  → Pydantic BaseSettings

  All settings read from environment variables (or .env file):

  ┌─────────────────────────────────────────────────────────────────────┐
  │  MONGO_URI          = "mongodb://localhost:27017"                   │
  │  JWT_SECRET         = "..."  (32+ char random string)              │
  │  JWT_ALGORITHM      = "HS256"                                       │
  │  ALLOWED_HOSTS      = ["localhost", "yourdomain.com"]               │
  │  CORS_ORIGINS       = ["http://localhost:5173"]                     │
  │                                                                     │
  │  AI_PROVIDER        = "auto" | "coze" | "ollama"                   │
  │  COZE_API_KEY       = "..."                                         │
  │  COZE_BOT_ID        = "..."                                         │
  │  OLLAMA_HOST        = "http://localhost:11434"                      │
  │  OLLAMA_MODEL       = "llama3.2-vision:11b"                        │
  │                                                                     │
  │  GOOGLE_CLIENT_ID   = "..."                                         │
  │  GOOGLE_CLIENT_SECRET = "..."                                       │
  │  GOOGLE_REDIRECT_URI = "http://localhost:8000/api/auth/google/cb"  │
  │                                                                     │
  │  EMBEDDING_MODEL    = "all-MiniLM-L6-v2"  (HuggingFace)           │
  │  CHROMA_PERSIST_DIR = "./generated/vectorstore"                    │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment

```
  deploy/
  ├── Dockerfile.backend    ← Python 3.11-slim, installs requirements.txt
  ├── Dockerfile.frontend   ← node:20-alpine build → nginx:alpine serve
  └── nginx.conf            ← proxy /api → backend:8000,
                               serve / → frontend dist/
  docker-compose.yml:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  services:                                                           │
  │    mongodb:   mongo:7, volume: mongo_data                            │
  │    backend:   Dockerfile.backend, port 8000, env_file .env          │
  │    frontend:  Dockerfile.frontend, port 80                           │
  │    ollama:    ollama/ollama, GPU passthrough (optional)              │
  └──────────────────────────────────────────────────────────────────────┘

  Production HTTPS:
  - nginx terminates TLS
  - Backend behind nginx proxy (not directly exposed)
  - All cookies: Secure=True, SameSite=Strict in production
```

---

*Generated: 2026-04-12*
