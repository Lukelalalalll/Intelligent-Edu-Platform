# Intelligent Education Platform — Architecture Overview (English)

> For project presentations and PPT slides

---

## 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                      │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                  React 18 + TypeScript SPA (Vite)                       │    │
│   │                  Port: 5173 (dev)  /  Nginx (prod)                      │    │
│   └────────────────────────────┬────────────────────────────────────────────┘    │
└────────────────────────────────┼─────────────────────────────────────────────────┘
                                 │  HTTP REST / WebSocket / SSE
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       BACKEND  (FastAPI + Python 3.11)                           │
│                       Port: 5009                                                  │
│                                                                                  │
│  ┌─────────────────┐   ┌──────────────────────────────────────────────────────┐  │
│  │   Auth / JWT    │   │                   API Route Layer                    │  │
│  │  (Cookie-based) │   │  /api/auth  /api/ai  /api/chat  /api/questions       │  │
│  └─────────────────┘   │  /api/grading  /api/slides  /api/video  /api/admin   │  │
│                        └──────────────────────┬───────────────────────────────┘  │
│                                               │                                  │
│                         ┌─────────────────────┼────────────────────────┐         │
│                         │                     │                        │         │
│                         ▼                     ▼                        ▼         │
│              ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│              │   AI Gateway     │  │   RAG Pipeline   │  │  Domain Services │   │
│              │   Service        │  │  (ChromaDB +     │  │  Grading, Video, │   │
│              │  (Coze / Ollama) │  │  LangChain +     │  │  Slides, Q-Bank  │   │
│              └──────────────────┘  │  Sentence-Trans) │  │  Chat, Mailbox   │   │
│                                    └──────────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┬───────────────────┘
                                                               │
           ┌───────────────────────────────────────────────────┼───────────────────┐
           │                                                   │                   │
           ▼                                                   ▼                   ▼
  ┌─────────────────┐                               ┌──────────────────┐  ┌──────────────┐
  │    MongoDB       │                              │ Coze API (Cloud) │  │ Ollama Local │
  │  (Motor async)  │                               │  api.coze.com/v3 │  │  llama3.2-   │
  │  Chat, Users,   │                               │  Bot-based LLM   │  │  vision:11b  │
  │  Courses, Files │                               │  (GPT-4 backend) │  │  (Llama 3.2) │
  └─────────────────┘                               └──────────────────┘  └──────────────┘
```

---

## 2. Frontend Architecture

```
frontend/src/
│
├── main.tsx                      ← Application entry point
├── App.tsx                       ← Root component + router mount
│
├── router/                       ← React Router v7 route configuration
│
├── shared/                       ← Global shared layer
│   ├── Layout.tsx                ← App shell: sidebar, nav, top bar
│   │                               (mounts global WS + live unread counts)
│   ├── NetworkBanner.tsx         ← Offline detection banner
│   └── Layout.module.css
│
├── features/                     ← Vertically-sliced feature modules
│   │
│   ├── auth/                     ← Login / Register / Forgot Password
│   ├── home/                     ← Teacher Home Dashboard
│   │
│   ├── ai-interact/              ← AI Workspace (chat + streaming output)
│   │   ├── hooks/useTypewriter   ← Typewriter animation (continuous rAF loop)
│   │   └── components/AIChat     ← Chat bubbles + Markdown rendering
│   │
│   ├── chat/                     ← Real-time IM system
│   │   ├── store/chatStore.ts    ← Zustand global state
│   │   ├── hooks/
│   │   │   ├── useChatWebSocket  ← WS connection + auto-reconnect
│   │   │   ├── useChatRooms      ← Room list + unread count seeding
│   │   │   └── useChatRoom       ← Single room messages + clearUnread
│   │   ├── components/
│   │   │   ├── ContactList       ← Left-pane contact list (Zustand selectors)
│   │   │   ├── ContactItem       ← Contact card + live unread badge
│   │   │   └── ChatWindow        ← Message area + send + read receipts
│   │   └── api/                  ← REST API wrappers (rooms/messages/contacts)
│   │
│   ├── grading/                  ← Assignment grading + PDF annotation
│   ├── knowledge-base/           ← Course RAG knowledge base management
│   ├── question-bank/            ← AI question generation & management
│   ├── slides/                   ← AI slide generation
│   ├── video-gen/                ← AI video generation
│   ├── diagram/                  ← AI diagram generation (Mermaid)
│   ├── study-notes/              ← Study notes
│   ├── homework/                 ← Homework management
│   ├── mailbox/                  ← Gmail integration
│   ├── image-extractor/          ← PDF image extraction
│   ├── admin/                    ← Admin dashboard
│   └── admin-file-center/        ← File asset management
│
├── api/
│   └── client.ts                 ← Axios instance (withCredentials + interceptors)
│
├── hooks/                        ← Global hooks
│   └── useNetworkStatus.ts       ← Online/offline state detector
│
├── styles/                       ← Global styles / CSS variables
│   └── base.css                  ← Theme vars (--primary-color: #007b55)
│
└── types/
    └── api.ts                    ← Global TypeScript type definitions
```

### Frontend Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Routing | React Router v7 |
| State Management | Zustand v4 (selector subscriptions) |
| HTTP Client | Axios (cookie-based auth) |
| Real-time | Native WebSocket + Server-Sent Events (SSE) |
| Animation | Framer Motion |
| PDF Viewer | react-pdf + react-pdf-highlighter |
| Markdown | react-markdown + react-syntax-highlighter |
| Diagrams | Mermaid (dynamic rendering) |
| Testing | Vitest + Testing Library |

---

## 3. Backend Architecture

```
backend/
│
├── main.py                       ← FastAPI entry + CORS + route registration
├── config.py                     ← Centralised config (env variables)
│
├── core/                         ← Infrastructure core
│   ├── database.py               ← MongoDB (Motor async driver)
│   ├── security.py               ← JWT issue/verify (python-jose)
│   ├── ai_provider.py            ← AI provider router ["coze" | "local_ollama"]
│   ├── dependencies.py           ← FastAPI dependency injection
│   └── safe_requests.py          ← httpx secure wrapper (SSRF protection)
│
├── routes/                       ← API route layer
│   ├── auth_routes/              ← Register / Login / OAuth (Google)
│   │   ├── auth.py
│   │   ├── profile.py
│   │   └── student_v2.py
│   │
│   ├── ai_routes/                ← Core AI conversation routes ⭐
│   │   ├── router.py             ← /api/ai/chat (REST + Streaming)
│   │   ├── chat.py               ← Conversation processing pipeline
│   │   ├── chat_providers.py     ← Coze / Ollama dispatch
│   │   ├── chat_streaming.py     ← SSE streaming output
│   │   ├── rag_orchestrator.py   ← RAG orchestration (retrieve + generate)
│   │   ├── index_course.py       ← Course vectorisation index trigger
│   │   ├── memory.py             ← Conversation memory management
│   │   └── study_coach.py        ← Study coach mode
│   │
│   ├── ai_gateway_routes/        ← AI gateway (standalone bot calls) ⭐
│   │   ├── router.py             ← /api/ai-gateway/...
│   │   ├── grading.py            ← AI grading & scoring
│   │   └── feedback.py           ← AI student feedback
│   │
│   ├── chat_routes/              ← IM real-time chat routes
│   │   ├── rooms.py              ← Room CRUD + unread count aggregation
│   │   ├── messages.py           ← Message read/write/delete
│   │   ├── ws.py                 ← WebSocket endpoint + connection manager
│   │   ├── contacts.py           ← Friends / contacts
│   │   └── ai_actions.py         ← In-chat AI features
│   │
│   ├── questions_routes/         ← Question bank routes
│   │   ├── generate.py           ← AI question generation
│   │   ├── question_ops.py       ← Question CRUD
│   │   └── history.py            ← Generation history
│   │
│   ├── slides_routes/            ← AI slides routes
│   │   ├── pipeline.py           ← Generation pipeline
│   │   ├── delivery.py           ← Slide delivery / download
│   │   └── observability.py      ← Performance telemetry
│   │
│   ├── grading_routes.py         ← Assignment grading routes
│   ├── video_routes.py           ← AI video generation (SSE progress)
│   ├── study_notes_routes.py     ← Study notes
│   ├── homework_routes.py        ← Homework management
│   ├── diagram_routes.py         ← Mermaid diagram generation
│   ├── image_extractor_routes.py ← PDF image extraction
│   ├── mailbox_routes.py         ← Gmail API integration
│   └── admin_routes/             ← Admin backend
│       ├── users.py
│       ├── courses.py / courses_v2.py
│       ├── file_center.py / file_assets.py
│       ├── rag_eval.py           ← RAG evaluation
│       └── telemetry.py          ← LLM call monitoring
│
├── services/                     ← Business logic service layer
│   ├── ai_gateway_service.py     ← Coze API client ⭐
│   │                               (polling / streaming / Ollama fallback)
│   ├── local_llm_service.py      ← Ollama client ⭐
│   │                               (llama3.2-vision:11b)
│   ├── rag_chat_pipeline.py      ← RAG query rewriting + evidence packing
│   ├── vector_rag_service.py     ← ChromaDB semantic retrieval
│   ├── tfidf_rag_service.py      ← TF-IDF keyword retrieval
│   ├── course_rag_service/       ← Full course RAG service
│   ├── indexing_job_service.py   ← Async vectorisation job
│   ├── grading_service.py        ← Grading logic (PyMuPDF + AI)
│   ├── questions_service.py      ← Question generation/management
│   ├── chat_ai_service.py        ← In-chat AI assistant
│   ├── chat_search_service.py    ← Chat message search
│   ├── file_asset_service.py     ← File asset management
│   ├── transfer_dispatch_service.py ← File transfer dispatch
│   ├── ai_session_service.py     ← AI session management
│   ├── slides/                   ← Slide generation engine
│   └── video_service/            ← Video generation engine
│       ├── pipeline.py           ← Master pipeline orchestrator
│       ├── script.py             ← LLM script generation
│       ├── render.py             ← Playwright HTML → PNG rendering
│       ├── tts.py                ← edge-TTS speech synthesis
│       └── compose.py            ← FFmpeg video compositing
│
├── infrastructure/               ← Cross-cutting concerns
│   ├── telemetry.py              ← LLM call latency monitoring
│   └── rag_telemetry.py          ← RAG retrieval performance telemetry
│
├── prompts/                      ← YAML prompt template library
│   ├── chat_assistant.yaml
│   ├── grading.yaml
│   └── email.yaml
│
└── schemas/                      ← Pydantic data models
    ├── auth.py / ai.py / chat.py
    ├── grading.py / questions.py
    └── slides.py / diagram.py
```

### Backend Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI 0.135 + Uvicorn (ASGI) |
| Database | MongoDB + Motor (async driver) |
| Auth | JWT (python-jose) + HttpOnly Cookie |
| Vector DB | ChromaDB 1.0 |
| Embeddings | sentence-transformers (HuggingFace, local) |
| LLM Orchestration | LangChain 0.3 |
| PDF Processing | PyMuPDF (fitz) |
| Image Processing | Pillow |
| Web Rendering | Playwright (Chromium headless) |
| Text-to-Speech | edge-TTS (Microsoft) |
| Video Compositing | FFmpeg (subprocess) |
| Email Integration | Google Gmail API |
| Rate Limiting | SlowAPI |

---

## 4. AI Provider Architecture (Dual-Engine)

```
                         ┌─────────────────────────┐
                         │      ai_provider.py      │
                         │    resolve_provider()    │
                         │                          │
                         │   AI_DEFAULT_PROVIDER    │
                         │     (env variable)       │
                         └──────────┬───────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
                    ▼                                ▼
     ┌──────────────────────────┐    ┌──────────────────────────┐
     │       Coze API  ⭐       │    │    Ollama (Local)  ⭐     │
     │                          │    │                          │
     │  api.coze.com/v3/chat    │    │  localhost:11434         │
     │  Bot-based conversation  │    │  llama3.2-vision:11b     │
     │                          │    │  (Meta Llama 3.2, 11B)   │
     │                          │    │  ✓ Fully local deploy    │
     │  ✓ Tool-call support     │    │  ✓ Vision understanding  │
     │  ✓ No GPU required       │    │  ✓ Data stays on-prem    │
     │  ✗ Needs internet + key  │    │  ✗ Needs local GPU/CPU   │
     └────────────┬─────────────┘    └──────────────┬───────────┘
                  │                                  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────-┐
                    │      AIGatewayService       │
                    │                             │
                    │  • Unified interface        │
                    │  • Coze polling / streaming │
                    │  • Ollama fallback          │
                    │  • YAML prompt injection    │
                    │  • RAG context injection    │
                    │  • TelemetryTimer tracing   │
                    └────────────────────────────-┘
```

---

## 5. RAG Knowledge Base Architecture

```
  Teacher uploads PDF / DOCX
            │
            ▼
  ┌──────────────────────┐
  │  IndexingJobService  │   Background async job
  │  (vectorisation)     │
  └──────────┬───────────┘
             │  LangChain Text Splitter
             │  (chunk_size = 800 tokens)
             ▼
  ┌──────────────────────────────────────┐
  │  HuggingFace Sentence-Transformers   │
  │  (local embedding model, no API key) │
  └────────────────┬─────────────────────┘
                   │  embed vectors
                   ▼
  ┌──────────────────────────────────────┐
  │              ChromaDB                │
  │   generated/vectorstore/             │
  │   courses/<course_id>/               │
  └────────────────┬─────────────────────┘
                   │
     ┌─────────────┴──────────────┐
     │   Query time (dual path)   │
     │                            │
     ▼                            ▼
  Vector RAG                TF-IDF RAG
  (semantic similarity)     (keyword match)
     │                            │
     └─────────────┬──────────────┘
                   │  merge + re-rank results
                   ▼
           ┌─────────────────┐
           │  RAG Pipeline   │
           │  query rewrite  │
           │  → pack evidence│
           │  → inject prompt│
           └───────┬─────────┘
                   │
                   ▼
          AI Gateway (Coze / Llama)
          generates grounded answer
```

---

## 6. Real-time Chat Architecture (IM)

```
  User A (Browser)                          User B (Browser)
        │                                          │
        │   WebSocket  /api/chat/ws                │
        ▼                                          ▼
  ┌──────────────────────────────────────────────────┐
  │               ConnectionManager                  │
  │         Dict[user_id → WebSocket]                │
  │                                                  │
  │   user_A_ws ──┐                                  │
  │   user_B_ws ──┤   broadcast_to_room()            │
  │   user_C_ws ──┘                                  │
  └───────────────────────┬──────────────────────────┘
                          │  persist & read
                          ▼
              ┌───────────────────────┐
              │       MongoDB         │
              │   chat_messages       │
              │   chat_rooms          │
              └───────────────────────┘

  WS Event Types:
    → new_message       server broadcasts to all room members
    → message_ack       confirms sender's optimistic message
    → message_recalled  syncs message deletion
    → typing            ephemeral typing indicator
    → read_receipt      marks messages as read
    → room_created / room_updated / room_deleted
    → friend_request / friend_accepted / kicked_from_room

  Frontend Zustand Store (chatStore.ts):
    unreadCounts[roomId]  ← ContactItem subscribes via selector
    totalUnread           ← Sidebar Chat badge subscribes via selector
    incrementUnread()     ← fired on new_message (if room not active)
    clearUnread()         ← fired when user opens a room
```

---

## 7. Video Generation Pipeline

```
  User inputs topic / script
            │
            ▼
  ┌─────────────────────┐
  │     script.py       │   Ollama (llama3.2) generates slide scripts
  │  SSE progress push  │   Server-Sent Events stream progress to UI
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │      render.py      │   Playwright (Chromium headless)
  │                     │   Renders HTML slides → PNG frames
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │       tts.py        │   edge-TTS (Microsoft Azure voices)
  │                     │   Generates per-slide .mp3 narration
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │     compose.py      │   FFmpeg subprocess
  │                     │   PNG frames + MP3 audio → MP4 video
  └──────────┬──────────┘
             │
             ▼
  generated/videos/<task_id>.mp4
  (served via FastAPI static files)
```

---

## 8. Deployment Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      Docker Compose                        │
│                                                           │
│  ┌──────────────────────┐   ┌──────────────────────────┐  │
│  │  Dockerfile.frontend │   │   Dockerfile.backend     │  │
│  │                      │   │                          │  │
│  │  Node build →        │   │   Python 3.11 +          │  │
│  │  Nginx static serve  │   │   Uvicorn ASGI server    │  │
│  │  Port: 80            │   │   Port: 5009             │  │
│  └──────────────────────┘   └──────────────────────────┘  │
│               │                          │                 │
│               └────────────┬─────────────┘                 │
│                            │                              │
│                  ┌─────────▼──────────┐                   │
│                  │    nginx.conf       │                   │
│                  │  Reverse proxy:     │                   │
│                  │  /api  → backend   │                   │
│                  │  /     → frontend  │                   │
│                  └────────────────────┘                   │
└───────────────────────────────────────────────────────────┘
          │                         │
          ▼                         ▼
    MongoDB (Atlas                External AI
    or local)                     Coze API / Ollama
```

---

## 9. Feature Module Summary

| Feature | Frontend Route | Backend Route | AI Engine |
|---------|---------------|---------------|-----------|
| AI Chat Workspace | `/ai-interaction` | `/api/ai/chat` | Coze API / Llama 3.2 |
| Instant Messaging (IM) | `/chat` | `/api/chat/ws` | — (WebSocket) |
| In-Chat AI Assistant | `/chat` | `/api/chat/ai/*` | Coze / Llama |
| Course RAG Knowledge Base | `/knowledge-base` | `/api/ai/index-course` | Llama + ChromaDB |
| AI Question Generation | `/question-bank` | `/api/questions/generate` | Coze / Llama |
| AI Slide Generation | `/slides` | `/api/slides/*` | Coze / Llama |
| AI Video Generation | `/video-gen` | `/api/video/*` | Llama (script) |
| AI Assignment Grading | `/grading` | `/api/ai-gateway/grading` | Coze API |
| AI Diagram Generation | `/diagram` | `/api/diagram/*` | Coze / Llama |
| Study Notes | `/study-notes` | `/api/study-notes/*` | Coze / Llama |
| PDF Image Extraction | `/image-extractor` | `/api/image-extractor/*` | Llama (Vision) |
| Mailbox Integration | `/mailbox` | `/api/mailbox/*` | Gmail API |
| Admin Dashboard | `/admin/*` | `/api/admin/*` | — |

---

*Generated: 2026-04-12*
