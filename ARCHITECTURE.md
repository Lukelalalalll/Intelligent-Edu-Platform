# Intelligent Education Platform — Architecture Overview

> 适用场景：项目汇报 / PPT 架构介绍

---

## 1. 整体系统架构

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                                          │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                  React 18 + TypeScript SPA (Vite)                       │    │
│   │                  Port: 5173 (dev)  /  Nginx (prod)                      │    │
│   └────────────────────────────┬────────────────────────────────────────────┘    │
└────────────────────────────────┼─────────────────────────────────────────────────┘
                                 │  HTTP REST / WebSocket / SSE
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND  (FastAPI + Python 3.11)                             │
│                     Port: 5009                                                    │
│                                                                                  │
│  ┌─────────────────┐   ┌──────────────────────────────────────────────────────┐  │
│  │   Auth / JWT    │   │              API Route Layer                         │  │
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
  │  (Motor async)  │                               │  coze.com/v3     │  │  llama3.2-   │
  │  Chat, Users,   │                               │  Bot-based LLM   │  │  vision:11b  │
  │  Courses, Files │                               │                  │  │  (Llama 3.2) │
  └─────────────────┘                               └──────────────────┘  └──────────────┘
```

---

## 2. 前端架构 (Frontend)

```
frontend/src/
│
├── main.tsx                      ← 应用入口
├── App.tsx                       ← 根组件 + 路由挂载
│
├── router/                       ← React Router v7 路由配置
│
├── shared/                       ← 全局共享层
│   ├── Layout.tsx                ← 全局布局、侧边栏、导航
│   │                               (全局挂载 WS 连接 + 实时未读数)
│   ├── NetworkBanner.tsx         ← 离线检测横幅
│   └── Layout.module.css
│
├── features/                     ← 按功能垂直切割的模块
│   │
│   ├── auth/                     ← 登录 / 注册 / 忘记密码
│   ├── home/                     ← 教师首页 Dashboard
│   │
│   ├── ai-interact/              ← AI 工作台 (聊天 + 流式输出)
│   │   ├── hooks/useTypewriter   ← 打字机动画 (rAF 连续帧)
│   │   └── components/AIChat     ← 对话气泡 + Markdown 渲染
│   │
│   ├── chat/                     ← 即时通讯 (IM) 系统
│   │   ├── store/chatStore.ts    ← Zustand 全局状态
│   │   ├── hooks/
│   │   │   ├── useChatWebSocket  ← WS 连接 + 自动重连
│   │   │   ├── useChatRooms      ← 房间列表 + 未读数初始化
│   │   │   └── useChatRoom       ← 单房间消息 + clearUnread
│   │   ├── components/
│   │   │   ├── ContactList       ← 左侧联系人列表 (selector 订阅)
│   │   │   ├── ContactItem       ← 联系人卡片 + 实时未读徽章
│   │   │   └── ChatWindow        ← 消息区 + 发送 + 已读回执
│   │   └── api/                  ← REST API 封装 (rooms/messages/contacts)
│   │
│   ├── grading/                  ← 作业批改 + PDF 标注
│   ├── knowledge-base/           ← 课程 RAG 知识库管理
│   ├── question-bank/            ← 题库生成与管理
│   ├── slides/                   ← AI 幻灯片生成
│   ├── video-gen/                ← AI 视频生成
│   ├── diagram/                  ← AI 图表生成 (Mermaid)
│   ├── study-notes/              ← 学习笔记
│   ├── homework/                 ← 作业管理
│   ├── mailbox/                  ← 邮箱集成
│   ├── image-extractor/          ← PDF 图片抽取
│   ├── admin/                    ← 管理员 Dashboard
│   └── admin-file-center/        ← 文件资产管理
│
├── api/
│   └── client.ts                 ← Axios 实例 (withCredentials + 拦截器)
│
├── hooks/                        ← 全局 Hooks
│   └── useNetworkStatus.ts       ← 在线/离线状态
│
├── styles/                       ← 全局样式 / CSS 变量
│   └── base.css                  ← 主题变量 (--primary-color: #007b55)
│
└── types/
    └── api.ts                    ← 全局 TypeScript 类型定义
```

### 前端技术栈

| 层级 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 路由 | React Router v7 |
| 状态管理 | Zustand v4 (selector 订阅) |
| HTTP | Axios (Cookie 认证) |
| 实时通信 | Native WebSocket + SSE |
| 动画 | Framer Motion |
| PDF | react-pdf + react-pdf-highlighter |
| Markdown | react-markdown + react-syntax-highlighter |
| 图表 | Mermaid (动态渲染) |
| 测试 | Vitest + Testing Library |

---

## 3. 后端架构 (Backend)

```
backend/
│
├── main.py                       ← FastAPI 入口 + CORS + 路由注册
├── config.py                     ← 统一配置 (环境变量)
│
├── core/                         ← 基础设施核心
│   ├── database.py               ← MongoDB (Motor 异步驱动)
│   ├── security.py               ← JWT 签发/校验 (python-jose)
│   ├── ai_provider.py            ← AI 提供商路由 ["coze" | "local_ollama"]
│   ├── dependencies.py           ← FastAPI 依赖注入
│   └── safe_requests.py          ← httpx 安全封装 (SSRF 防护)
│
├── routes/                       ← API 路由层
│   ├── auth_routes/              ← 注册/登录/OAuth (Google)
│   │   ├── auth.py
│   │   ├── profile.py
│   │   └── student_v2.py
│   │
│   ├── ai_routes/                ← AI 对话核心路由 ⭐
│   │   ├── router.py             ← /api/ai/chat (REST + Streaming)
│   │   ├── chat.py               ← 对话处理流
│   │   ├── chat_providers.py     ← Coze / Ollama 分发
│   │   ├── chat_streaming.py     ← SSE 流式输出
│   │   ├── rag_orchestrator.py   ← RAG 编排 (检索+生成)
│   │   ├── index_course.py       ← 课程向量化索引触发
│   │   ├── memory.py             ← 对话记忆管理
│   │   └── study_coach.py        ← 学习教练模式
│   │
│   ├── ai_gateway_routes/        ← AI 网关 (独立 Bot 调用) ⭐
│   │   ├── router.py             ← /api/ai-gateway/...
│   │   ├── grading.py            ← AI 批改评分
│   │   └── feedback.py           ← AI 学生反馈
│   │
│   ├── chat_routes/              ← IM 即时通讯路由
│   │   ├── rooms.py              ← 房间 CRUD + 未读数聚合
│   │   ├── messages.py           ← 消息增删查
│   │   ├── ws.py                 ← WebSocket 端点 + 连接管理
│   │   ├── contacts.py           ← 好友/联系人
│   │   └── ai_actions.py         ← 聊天内 AI 功能
│   │
│   ├── questions_routes/         ← 题库路由
│   │   ├── generate.py           ← AI 生成题目
│   │   ├── question_ops.py       ← 题目 CRUD
│   │   └── history.py            ← 生成历史
│   │
│   ├── slides_routes/            ← AI 幻灯片路由
│   │   ├── pipeline.py           ← 生成流水线
│   │   ├── delivery.py           ← 幻灯片交付/下载
│   │   └── observability.py      ← 性能遥测
│   │
│   ├── grading_routes.py         ← 作业批改路由
│   ├── video_routes.py           ← AI 视频生成路由 (SSE 进度)
│   ├── study_notes_routes.py     ← 学习笔记
│   ├── homework_routes.py        ← 作业管理
│   ├── diagram_routes.py         ← Mermaid 图表生成
│   ├── image_extractor_routes.py ← PDF 图片抽取
│   ├── mailbox_routes.py         ← Gmail API 集成
│   └── admin_routes/             ← 管理员后台
│       ├── users.py
│       ├── courses.py / courses_v2.py
│       ├── file_center.py / file_assets.py
│       ├── rag_eval.py           ← RAG 评估
│       └── telemetry.py          ← LLM 调用监控
│
├── services/                     ← 业务逻辑服务层
│   ├── ai_gateway_service.py     ← Coze API 客户端 ⭐
│   │                               (轮询 / 流式 / 降级到 Ollama)
│   ├── local_llm_service.py      ← Ollama 客户端 ⭐
│   │                               (llama3.2-vision:11b)
│   ├── rag_chat_pipeline.py      ← RAG 查询重写 + 证据打包
│   ├── vector_rag_service.py     ← ChromaDB 向量检索
│   ├── tfidf_rag_service.py      ← TF-IDF 关键词检索
│   ├── course_rag_service/       ← 课程 RAG 完整服务
│   ├── indexing_job_service.py   ← 异步向量化任务
│   ├── grading_service.py        ← 批改逻辑 (PyMuPDF + AI)
│   ├── questions_service.py      ← 题目生成/管理
│   ├── chat_ai_service.py        ← 聊天内 AI 助手
│   ├── chat_search_service.py    ← 聊天消息搜索
│   ├── file_asset_service.py     ← 文件资产管理
│   ├── transfer_dispatch_service.py ← 文件传输调度
│   ├── ai_session_service.py     ← AI 会话管理
│   ├── slides/                   ← 幻灯片生成引擎
│   └── video_service/            ← 视频生成引擎
│       ├── pipeline.py           ← 总流水线
│       ├── script.py             ← LLM 脚本生成
│       ├── render.py             ← Playwright HTML→图片渲染
│       ├── tts.py                ← edge-TTS 语音合成
│       └── compose.py            ← FFmpeg 视频合成
│
├── infrastructure/               ← 横切关注点
│   ├── telemetry.py              ← LLM 调用耗时监控
│   └── rag_telemetry.py          ← RAG 检索性能遥测
│
├── prompts/                      ← Prompt 模板库 (YAML)
│   ├── chat_assistant.yaml
│   ├── grading.yaml
│   └── email.yaml
│
└── schemas/                      ← Pydantic 数据模型
    ├── auth.py / ai.py / chat.py
    ├── grading.py / questions.py
    └── slides.py / diagram.py
```

### 后端技术栈

| 层级 | 技术 |
|------|------|
| 框架 | FastAPI 0.135 + Uvicorn (ASGI) |
| 数据库 | MongoDB + Motor (异步驱动) |
| 认证 | JWT (python-jose) + HttpOnly Cookie |
| 向量数据库 | ChromaDB 1.0 |
| 向量嵌入 | sentence-transformers (HuggingFace) |
| LLM 编排 | LangChain 0.3 |
| PDF 处理 | PyMuPDF (fitz) |
| 图像处理 | Pillow |
| 网页渲染 | Playwright (Chromium) |
| 语音合成 | edge-TTS |
| 视频合成 | FFmpeg (subprocess) |
| 邮件集成 | Google Gmail API |
| 限流 | SlowAPI |

---

## 4. AI 提供商架构 (双引擎)

```
                         ┌─────────────────────────┐
                         │   ai_provider.py         │
                         │   resolve_provider()     │
                         │                          │
                         │  AI_DEFAULT_PROVIDER     │
                         │  (env variable)          │
                         └──────────┬───────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
                    ▼                                ▼
     ┌──────────────────────────┐    ┌──────────────────────────┐
     │       Coze API  ⭐        │    │    Ollama (Local) ⭐      │
     │                          │    │                          │
     │  api.coze.com/v3/chat    │    │  localhost:11434         │
     │  Bot-based conversation  │    │  llama3.2-vision:11b     │
     │                          │    │  (Meta Llama 3.2, 11B)   │
     │  ✓ GPT-4 级别推理        │    │  ✓ 完全本地部署           │
     │  ✓ 工具调用支持           │    │  ✓ 视觉理解 (Vision)      │
     │  ✓ 无需显卡               │    │  ✓ 数据不出境             │
     │  ✗ 需要网络/API Key       │    │  ✗ 需要本地 GPU/CPU      │
     └────────────┬─────────────┘    └──────────────┬───────────┘
                  │                                  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   AIGatewayService     │
                    │                        │
                    │  • 统一接口抽象         │
                    │  • Coze 轮询/流式      │
                    │  • Ollama 降级冗余     │
                    │  • Prompt 模板注入     │
                    │  • RAG 上下文注入      │
                    │  • TelemetryTimer 监控 │
                    └────────────────────────┘
```

---

## 5. RAG 知识库架构

```
  教师上传 PDF/DOCX
         │
         ▼
  ┌──────────────────┐
  │ IndexingJobService│   异步任务队列
  │ (后台向量化)      │
  └────────┬─────────┘
           │  LangChain Text Splitter
           │  (分块: chunk_size=800)
           ▼
  ┌──────────────────────────────────┐
  │   HuggingFace Sentence-Transformers │
  │   (本地嵌入模型, 无需 API)        │
  └────────────────┬─────────────────┘
                   │  向量化
                   ▼
  ┌──────────────────────────────────┐
  │         ChromaDB                 │
  │   generated/vectorstore/         │
  │   courses/<course_id>/           │
  └────────────────┬─────────────────┘
                   │
     ┌─────────────┴──────────────┐
     │  查询时 (双路检索)           │
     │                            │
     ▼                            ▼
  Vector RAG              TF-IDF RAG
  (语义相似度)             (关键词匹配)
     │                            │
     └─────────────┬──────────────┘
                   │  结果融合 + 排序
                   ▼
           ┌───────────────┐
           │ RAG Pipeline  │
           │ 查询重写 →    │
           │ 证据打包 →    │
           │ Prompt 注入  │
           └───────┬───────┘
                   │
                   ▼
           AI Gateway (Coze / Llama)
```

---

## 6. 实时通讯架构 (IM Chat)

```
  用户 A 浏览器                         用户 B 浏览器
       │                                     │
       │  WebSocket /api/chat/ws             │
       ▼                                     ▼
  ┌─────────────────────────────────────────────┐
  │          ConnectionManager                   │
  │   Dict[user_id → WebSocket]                  │
  │                                             │
  │  user_A_ws ──┐                              │
  │  user_B_ws ──┤  broadcast_to_room()         │
  │  user_C_ws ──┘                              │
  └───────────────────────┬─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  MongoDB            │
              │  chat_messages      │
              │  chat_rooms         │
              └─────────────────────┘

  事件类型: new_message / message_ack / message_recalled
           typing / read_receipt / room_created / room_updated
           friend_request / friend_accepted / kicked_from_room

  前端 Zustand Store:
   unreadCounts[roomId] → ContactItem selector 直接订阅
   totalUnread → 侧边栏 Chat 徽章
```

---

## 7. 视频生成流水线

```
  用户输入主题/脚本
         │
         ▼
  ┌──────────────────┐
  │  script.py       │   Ollama (llama3.2) 生成幻灯片脚本
  │  SSE 实时进度    │   Server-Sent Events 推送进度
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  render.py       │   Playwright (Chromium) 渲染 HTML → PNG
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  tts.py          │   edge-TTS 微软语音合成
  │                  │   生成 .mp3 音频
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │  compose.py      │   FFmpeg subprocess
  │                  │   图片 + 音频 → MP4 视频
  └────────┬─────────┘
           │
           ▼
  generated/videos/<task_id>.mp4
```

---

## 8. 部署架构

```
┌──────────────────────────────────────────────────────┐
│                    Docker Compose                     │
│                                                      │
│  ┌──────────────────┐      ┌──────────────────────┐  │
│  │  Dockerfile.     │      │  Dockerfile.         │  │
│  │  frontend        │      │  backend             │  │
│  │                  │      │                      │  │
│  │  Node build →    │      │  Python 3.11 +       │  │
│  │  Nginx静态服务   │      │  Uvicorn ASGI        │  │
│  │  Port: 80        │      │  Port: 5009          │  │
│  └──────────────────┘      └──────────────────────┘  │
│            │                         │               │
│            └──────────┬──────────────┘               │
│                       │                              │
│              ┌────────▼────────┐                     │
│              │   nginx.conf     │                     │
│              │  反向代理        │                     │
│              │  /api → backend  │                     │
│              │  /    → frontend │                     │
│              └─────────────────┘                     │
└──────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   MongoDB Atlas         外部 AI 服务
   (or local)            Coze API / Ollama
```

---

## 9. 功能模块一览表

| 功能模块 | 前端路由 | 后端路由 | AI 引擎 |
|---------|---------|---------|---------|
| AI 对话工作台 | `/ai-interaction` | `/api/ai/chat` | Coze API / Llama 3.2 |
| 即时通讯 (IM) | `/chat` | `/api/chat/ws` | — |
| 聊天内 AI 助手 | `/chat` | `/api/chat/ai/*` | Coze / Llama |
| 课程 RAG 知识库 | `/knowledge-base` | `/api/ai/index-course` | Llama + ChromaDB |
| AI 题目生成 | `/question-bank` | `/api/questions/generate` | Coze / Llama |
| AI 幻灯片生成 | `/slides` | `/api/slides/*` | Coze / Llama |
| AI 视频生成 | `/video-gen` | `/api/video/*` | Llama (script) |
| AI 批改评分 | `/grading` | `/api/ai-gateway/grading` | Coze API |
| AI 图表生成 | `/diagram` | `/api/diagram/*` | Coze / Llama |
| 学习笔记 | `/study-notes` | `/api/study-notes/*` | Coze / Llama |
| PDF 图片抽取 | `/image-extractor` | `/api/image-extractor/*` | Llama (Vision) |
| 邮件集成 | `/mailbox` | `/api/mailbox/*` | Gmail API |
| 管理后台 | `/admin/*` | `/api/admin/*` | — |

---

*Generated: 2026-04-12*
