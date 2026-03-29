# Intelligent Edu Platform — 系统级优化与业务发展战略报告

> 基于代码库深度审计 · 2026 年 3 月 · 面向 6-18 个月演进

---

## 〇、高管摘要

**当前状态判断**：项目已完成"从 0 到 0.5"——前端 11 个页面 UI 完整度高，后端 AI 批改主线可用，RAG 双路已跑通，Gmail OAuth 已接入。但从架构角度看，正处于**"工具集腐化临界点"**：再往前加功能，数据层碎片化、Agent 能力散装、模块相互隔离的代价将指数级上升。

**核心结论**：

| 维度 | 判断 |
|------|------|
| 最有价值的业务闭环 | 教师批改工作台（Grading Mailbox → Workbench → Rubric → AI Feedback → PDF 输出）|
| 最应砍掉/合并的部分 | Sub3（Image Extract）并入 Sub4（Diagram Tool）；AI Email 与 Email Agent 合并为一个入口 |
| 北极星能力 | **课程级知识驱动的 AI 批改 + 邮件驱动的教学沟通自动化** |
| 最大风险 | 继续横向铺功能但不建知识底座和 Agent 编排层，3-6 个月后每个模块都是孤岛 |
| 最该集中做的事 | ① 统一数据层 → ② 课程知识库 → ③ Grading Agent MVP → ④ Email Agent MVP |

**一句话定位**：

> **面向高校教师与课程团队的 AI 教学运营平台——以知识系统为底座、以批改与沟通为双引擎、以多 Agent 协作为核心能力，将教师从重复性教学事务中解放出来。**

**最应该立刻做的 10 件事**（详见第 13 节）：
1. 统一数据层：courses.json 全量入 MongoDB
2. 建立 Prompt Registry + Tool Registry
3. Grading Agent MVP（批量预审 + 置信度分级）
4. 课程级知识库（assignment-level → course-level RAG）
5. Email Agent v1（智能分类 + 摘要 + 建议回复）
6. 统一前端工作台 Shell（侧边栏 + 全局状态 + 通知中心）
7. RAG 评测 Pipeline（10 道 golden query 起步）
8. 教师偏好记忆系统雏形
9. Sub3 合并入 Sub4，AI Email 合并入 Email Agent
10. 错误监控 + 接口 telemetry 基础设施

---

## 一、项目现状诊断

### 1.1 核心业务主线判断

```
主航道（核心价值链）：
  教师登录 → 选课/选作业 → 批改工作台 → AI 辅助反馈 → Rubric 打分 → 输出标注 PDF

能力插件（围绕主航道增值）：
  AI Chat → 通用问答辅助
  Email Agent → 教学沟通自动化
  Course Knowledge → 知识底座

工具附件（独立工具，尚未融入主线）：
  Slides Generator (Sub1)
  Question Generator (Sub2)
  Image Extract (Sub3)
  Diagram Tool (Sub4)
```

### 1.2 当前最大问题：不是技术问题，是架构 + 定位双重问题

| 问题维度 | 具体表现 |
|----------|----------|
| **数据层碎片化** | courses.json（文件）+ MongoDB（用户/annotations 部分）+ JSON 文件（annotations/）+ SQLite（遗留 users.db）。四套数据源，无法做联合查询、事件流、审计追踪 |
| **AI 能力散装** | Coze 直接 HTTP 调用散落在 ai_gateway_service 和各 sub_routes 中，无统一 prompt 管理、无 tool registry、无 cost tracking |
| **模块各自为政** | Sub1-Sub4 各有独立上传/生成/导出流程，无共享知识、无共享文件系统、无共享用户记忆 |
| **前后端断层** | 前端 Email Agent UI 已设计好回复功能，后端 Gmail routes 只有 read-only 4 个接口；前端 Admin Dashboard UI 完整，后端 admin 接口不全 |
| **RAG 停在 submission 粒度** | 每次批改只检索当前 submission 的 chunks，无法利用历次反馈、同一 assignment 其他学生的共性问题、课程教学目标 |
| **无 Agent 编排层** | 所有 AI 调用都是"前端点按钮 → 后端调一次 API → 返回结果"，没有任务链、没有 planning、没有 tool use、没有 memory |

### 1.3 如果继续按现有方式扩展，3-6 个月后的结构性问题

1. **知识不可复用**：每个模块自己存文件、自己调 AI，教师在批改中积累的反馈模式无法流动到题目生成、课程问答
2. **Prompt 管理失控**：当前 prompt 硬编码在 service 层（ai_gateway_service.py 第 200+ 行），多处重复，版本无法追踪
3. **成本黑洞**：Coze API 调用无 metering，无 cache，无 fallback，一旦使用量上升，无法优化
4. **数据审计不可能**：annotations 存 JSON 文件，无 created_by/updated_at/version，无法做回滚和审计
5. **多人协作不可能**：基于文件存储 + 内存 session，无法支持多教师协同批改

### 1.4 当前最值得砍掉 / 合并 / 重构的部分

| 动作 | 对象 | 理由 |
|------|------|------|
| **合并** | Sub3 (Image Extract) → Sub4 (Diagram Tool) | 功能高度重叠（都是从 PDF 提取视觉元素），合并为"AI Visual Tool" |
| **合并** | AI Email + Email Agent → 统一 "Email Agent" | 当前两个入口（`/ai-email` 和 `/email-agent`）指向相似功能，用户困惑 |
| **下沉** | PDF 提取能力 → 统一 Document Service | 当前 Sub1/Sub2/Sub3/Sub4/Grading 都各自做 PDF 解析，应下沉为平台级服务 |
| **重构** | Annotation 存储 → MongoDB | 从 JSON 文件迁移到 MongoDB，支持索引、查询、版本 |
| **删除** | extensions.py (Flask 遗留) | 无任何引用，死代码 |
| **删除** | SQLite users.db 路径 | 已全面切换 MongoDB，清理遗留配置 |

---

## 二、北极星定位

### 2.1 定位选择分析

| 定位选项 | 适合度 | 理由 |
|----------|--------|------|
| 教师智能工作台 | ★★★★☆ | 当前主线天然支持，但天花板有限 |
| 教学运营 Agent 平台 | ★★★★★ | 批改 + 沟通 + 知识 + 内容生成构成完整教学运营闭环 |
| 课程智能助手平台 | ★★★☆☆ | 偏被动，不够体现 Agent 主动性 |
| 全链路教育 Agent OS | ★★☆☆☆ | 过于宏大，当前团队和数据量不支持 |

### 2.2 推荐定位

> **GradeFlow AI — 面向高校教师与课程团队的智能教学运营平台。通过课程知识驱动的 AI 批改引擎和邮件驱动的教学沟通 Agent，将教师从重复性教学事务中解放出来，让每一份反馈都有知识支撑，每一封邮件都有上下文理解。**

### 2.3 核心用户与价值链

| 维度 | 定义 |
|------|------|
| **核心用户** | 高校教师（尤其是带多门课、多班次的教师），课程助教 |
| **次要用户** | 院系教学管理者、学生（被动受益方） |
| **核心付费方** | 院系/学校教学管理部门（B2B）；个人教师订阅（B2C 冷启动） |
| **核心价值链** | 作业提交 → AI 预审分流 → 知识增强批改 → 智能反馈生成 → 学生沟通自动化 → 教学数据沉淀 → 课程知识进化 |
| **核心护城河** | ① 课程级知识库（竞品无法轻易复制的教学数据资产）② 教师偏好模型（个性化批改风格学习）③ 教学场景 Agent 编排 know-how |

---

## 三、总体架构重构建议

### 3.1 目标架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  Unified Shell (Sidebar + Workspace + Notification Center)      │
│  ├─ Grading Workspace    ├─ Email Workspace    ├─ Content Studio│
│  ├─ Course Console       ├─ AI Assistant       ├─ Admin Console │
│  └─ Student Portal                                              │
├─────────────────────────────────────────────────────────────────┤
│                   WORKFLOW / ORCHESTRATION LAYER                 │
│  Task Queue (批改任务, 邮件任务, 内容生成任务)                     │
│  State Machine (submission 生命周期, email 处理流程)              │
│  Event Bus (annotation.created, email.received, score.saved)    │
├─────────────────────────────────────────────────────────────────┤
│                       AGENT LAYER                                │
│  Agent Registry ──── Supervisor / Orchestrator                   │
│  ├─ GradingAgent    ├─ FeedbackAgent    ├─ EmailTriageAgent    │
│  ├─ RubricAgent     ├─ ContentAgent     ├─ EmailReplyAgent     │
│  └─ CourseKnowledgeAgent                └─ StudentProgressAgent │
│  Prompt Registry ─── Tool Registry ─── Memory Store             │
├─────────────────────────────────────────────────────────────────┤
│                 KNOWLEDGE & RETRIEVAL LAYER                      │
│  Multi-Level Knowledge Store                                     │
│  ├─ Submission Index   ├─ Assignment Index   ├─ Course Index    │
│  ├─ Teacher Preference ├─ Student Profile    ├─ Policy Index    │
│  Retrieval Engine: Hybrid (Sparse + Dense) + Rerank + Metadata  │
│  Citation & Grounding Engine                                     │
├─────────────────────────────────────────────────────────────────┤
│                   DOMAIN SERVICES LAYER                          │
│  ├─ GradingService      ├─ CourseService      ├─ UserService    │
│  ├─ DocumentService      ├─ EmailService       ├─ ContentService│
│  ├─ AnnotationService    ├─ RubricService      ├─ AnalyticsService│
├─────────────────────────────────────────────────────────────────┤
│                    PERSISTENCE LAYER                             │
│  MongoDB (结构化数据: users, courses, assignments, annotations,  │
│           submissions, email_threads, agent_logs)               │
│  Chroma / Qdrant (向量存储: 多层级知识索引)                       │
│  Object Storage (MinIO/S3: PDF, images, PPTX, exports)          │
│  Redis (缓存: session, RAG cache, rate limit, task queue)       │
├─────────────────────────────────────────────────────────────────┤
│                   INTEGRATION LAYER                              │
│  ├─ Coze API Gateway     ├─ Gmail API          ├─ Zhipu API    │
│  ├─ DeepSeek API         ├─ HuggingFace        ├─ SerpAPI      │
│  ├─ TextIn OCR           ├─ OpenDataLoader                      │
│  Unified LLM Router (model selection, fallback, cost tracking)  │
├─────────────────────────────────────────────────────────────────┤
│               EVALUATION / OBSERVABILITY LAYER                   │
│  ├─ RAG Evaluation Pipeline    ├─ Agent Action Audit Log        │
│  ├─ LLM Cost & Latency Tracker ├─ User Behavior Analytics      │
│  ├─ Hallucination Detection     ├─ Error Monitoring (Sentry)    │
│  └─ A/B Test Framework for prompts                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 前端重构方向

**从"多页面路由"到"统一工作台 Shell"**：

```
当前：React Router 直接映射 11 个独立页面，每个页面独立管理状态

目标：
├─ AppShell (全局容器)
│  ├─ Sidebar (固定导航，显示任务计数/通知)
│  ├─ WorkspaceArea (主内容区，根据当前 context 渲染)
│  ├─ CommandPalette (全局快捷操作，Cmd+K)
│  ├─ NotificationCenter (Agent 结果通知、邮件提醒)
│  └─ GlobalStateProvider (React Context)
│     ├─ UserContext (auth, preferences, role)
│     ├─ CourseContext (当前课程/作业上下文)
│     ├─ AgentContext (Agent 状态, 任务队列)
│     └─ KnowledgeContext (当前知识范围)
```

**关键改动**：
1. 引入全局状态管理（推荐 Zustand，轻量且适合当前规模）
2. 侧边栏替代顶部导航，支持折叠/展开
3. Workspace 内支持多 Tab（类似 VS Code 标签页）
4. 全局 CourseContext：用户选中课程后，所有模块（批改、邮件、知识库、题目生成）自动对齐到该课程上下文

### 3.3 后端重构方向

**从"route → service 直连"到"domain-driven 分层"**：

```
当前结构：
routes/grading_routes.py → services/ai_gateway_service.py → Coze HTTP

目标结构：
routes/                        # 薄 controller 层，只做参数校验和鉴权
  grading_router.py
  email_router.py
  ...
domain/                        # 业务逻辑核心
  grading/
    grading_service.py         # 批改业务编排
    grading_models.py          # 领域模型
    grading_repository.py      # 数据访问
  email/
    email_service.py
    email_models.py
    email_repository.py
  course/
    course_service.py
    course_repository.py
  knowledge/
    knowledge_service.py       # 知识库管理
    retrieval_engine.py        # 检索引擎
agents/                        # Agent 定义与编排
  grading_agent.py
  email_agent.py
  orchestrator.py
  registry.py                  # Agent/Tool/Prompt 注册中心
infrastructure/                # 基础设施
  llm_router.py               # 统一 LLM 调用（Coze/DeepSeek/Zhipu 路由）
  vector_store.py              # 统一向量存储接口
  object_storage.py            # 文件存储抽象
  event_bus.py                 # 内部事件
  cache.py                     # Redis 缓存层
```

### 3.4 数据层重构路线

| 数据类型 | 当前 | 目标 | 优先级 |
|----------|------|------|--------|
| 用户 | MongoDB (users) | MongoDB (users) — 不变 | — |
| 课程/作业/提交 | courses.json 文件 | MongoDB (courses, assignments, submissions) | **P0** |
| 标注/评分 | JSON 文件 (data/annotations/) | MongoDB (annotations, scores) | **P0** |
| 上传文件 | 本地 static/ uploads/ | 短期不变，中期迁 MinIO/S3 | P2 |
| 邮件数据 | Gmail API 实时拉取 | MongoDB (email_threads) 缓存 + 增量同步 | P1 |
| 向量索引 | Chroma 本地持久化 | Chroma → 中期 Qdrant（支持 metadata filtering） | P1 |
| Agent 日志 | 无 | MongoDB (agent_logs) | P1 |
| 事件流 | 无 | Redis Streams 或 MongoDB Change Streams | P2 |
| Session | 内存 (Starlette SessionMiddleware) | Redis | P1 |

### 3.5 需要引入的基础设施

| 基础设施 | 是否引入 | 时间 | 理由 |
|----------|----------|------|------|
| Redis | **是** | Phase 1 | Session、缓存、简易任务队列（不需要 Celery 重） |
| 任务队列 | **是（轻量）** | Phase 1 | 用 Redis + asyncio 或 arq，不用 Celery |
| 工作流引擎 | **否（暂时）** | Phase 3 | 用简单状态机代替，避免过早引入 Temporal/Prefect |
| Agent Orchestrator | **是** | Phase 2 | 自建轻量版，基于 LangGraph 或自研 DAG runner |
| Prompt Registry | **是** | Phase 1 | JSON/YAML 文件 + 版本控制，不需要独立服务 |
| Tool Registry | **是** | Phase 2 | Python 装饰器注册 + schema 声明 |
| Memory Store | **是** | Phase 2 | MongoDB collection (agent_memory)，per-user、per-course |
| Evaluation Pipeline | **是** | Phase 1 | 离线 Python 脚本 + golden dataset，先手动后自动 |

---

## 四、Agent 系统设计

### 4.1 Agent 全景

```
                    ┌──────────────────────┐
                    │  Supervisor Agent     │
                    │  (Orchestrator)       │
                    └──────────┬───────────┘
         ┌─────────────┬──────┴──────┬─────────────┐
         ▼             ▼             ▼             ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
   │ Grading   │ │ Email     │ │ Content   │ │ Course    │
   │ Domain    │ │ Domain    │ │ Domain    │ │ Knowledge │
   │ Agents    │ │ Agents    │ │ Agents    │ │ Domain    │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
         │             │             │             │
   ┌─────┴─────┐ ┌─────┴─────┐      │       ┌─────┴─────┐
   │ Grading   │ │ Email     │      │       │ Course    │
   │ Agent     │ │ Triage    │      │       │ Knowledge │
   │ Feedback  │ │ Agent     │      │       │ Agent     │
   │ Agent     │ │ Email     │      │       │ Student   │
   │ Rubric    │ │ Reply     │      │       │ Progress  │
   │ Agent     │ │ Agent     │      │       │ Agent     │
   │ Triage    │ └───────────┘      │       └───────────┘
   │ Agent     │              ┌─────┴─────┐
   └───────────┘              │ Slides    │
                              │ Agent     │
                              │ Question  │
                              │ Agent     │
                              │ Diagram   │
                              │ Agent     │
                              └───────────┘
```

### 4.2 各 Agent 详细设计

#### Agent 1: Grading Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 接收一份 submission，执行完整批改流程：PDF 解析 → 结构理解 → Rubric 对标 → 逐项评分 → 生成反馈 |
| **所需工具** | `pdf_extract`, `rag_retrieve`, `rubric_lookup`, `score_write`, `annotation_write`, `llm_call` |
| **所需数据** | submission PDF, assignment rubric, course objectives, 同作业历次反馈, 教师偏好 |
| **所需 RAG** | submission-level + assignment-level (同作业其他学生共性问题) + teacher-preference |
| **输出产物** | 结构化评分 JSON + 逐项反馈 + 置信度分级 + 标注建议位置 |
| **风险点** | AI 评分与教师预期偏差大 → 必须有置信度标注 + 人工确认环节 |
| **MVP 实现** | 当前 `/api/ai/analyze` 增加 batch 模式 + 置信度字段 + 教师确认 UI |
| **长期演进** | 支持多模态（代码/图表/公式识别）、支持 rubric 自适应校准、支持跨学期知识迁移 |
| **人在回路** | **必须**。AI 给初步评分 + 反馈草稿，教师审阅后确认/修改/驳回 |

#### Agent 2: Feedback Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 针对教师选中的某段文本，生成高质量、有知识支撑的反馈建议 |
| **所需工具** | `rag_retrieve`, `llm_call`, `teacher_pref_lookup`, `rubric_lookup` |
| **所需数据** | 选中文本 + 上下文 + rubric 维度 + 教师历史反馈风格 + 课程教学目标 |
| **所需 RAG** | submission-level + assignment-level + teacher-preference-level |
| **输出产物** | 3 种反馈风格（简洁/详细/建设性）+ 引用来源 + 关联 rubric 维度 |
| **风险点** | 反馈过于模板化 / 与教师风格不一致 |
| **MVP 实现** | 当前 `/api/ai/feedback` + 教师风格 prompt 参数 + 引用来源展示 |
| **长期演进** | 教师反馈模式学习（few-shot from historical feedback）、多语言反馈 |

#### Agent 3: Rubric Calibration Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 分析多位教师对同一 rubric 的打分分布，识别校准偏差，提出调整建议 |
| **所需工具** | `score_analytics`, `rubric_lookup`, `llm_call` |
| **所需数据** | 同 assignment 所有打分记录, rubric 定义, 教师标注文本 |
| **所需 RAG** | assignment-level (所有 submission 的评分 + 反馈) |
| **输出产物** | 校准报告（各维度分布、异常值、建议调整权重、Inter-rater reliability） |
| **风险点** | 数据量不足时统计意义弱 → 设最小样本数门槛 |
| **MVP 实现** | 离线脚本，基于 MongoDB 评分数据跑分布分析 + LLM 总结 |
| **长期演进** | 实时校准仪表板 + Rubric 版本管理 + A/B 测试 |

#### Agent 4: Submission Triage Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 批量预审 submission，按质量/复杂度/风险分流成"AI 可自动批改""需教师重点关注""疑似抄袭"等类别 |
| **所需工具** | `pdf_extract`, `llm_call`, `similarity_check`, `rag_retrieve` |
| **所需数据** | 全部 submission PDF, rubric, 历史评分分布 |
| **所需 RAG** | assignment-level (用于基线比较) |
| **输出产物** | 分流列表 + 每份 submission 的快速摘要 + 风险标签 + 建议批改顺序 |
| **风险点** | 误分流导致教师跳过有问题的作业 → 必须支持教师覆盖 |
| **MVP 实现** | 新增 `/api/grading/triage` 接口，基于 text length + rubric keyword overlap + LLM 快判 |
| **长期演进** | 相似度检测（抄袭识别）、聚类分组（相似错误归类）、基于教师行为学习优先级 |

#### Agent 5: Course Knowledge Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 管理和检索课程级知识：教学大纲、逐周教学目标、Rubric 库、优秀作业范例、常见错误库 |
| **所需工具** | `rag_retrieve`, `rag_index`, `llm_call`, `document_parse` |
| **所需数据** | 课程文档（syllabus, slides, handouts）、assignment 集、历次 submission 反馈 |
| **所需 RAG** | course-level (教学文档) + assignment-level (作业库) + feedback-level (历次反馈) |
| **输出产物** | 精准的课程上下文检索结果、知识点关联图、教学进度对标 |
| **风险点** | 课程文档质量参差不齐 → 需要教师审核入库内容 |
| **MVP 实现** | 支持教师上传课程文档 → 自动 chunk + 向量化 → 在批改和问答中可检索 |
| **长期演进** | 知识图谱构建（知识点 → 作业 → 常见错误映射）、跨学期知识迁移 |

#### Agent 6: Student Progress Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 追踪单个学生在一门课中的表现趋势，识别薄弱环节，生成个性化学习建议 |
| **所需工具** | `score_analytics`, `rag_retrieve`, `llm_call` |
| **所需数据** | 该学生所有 submission 的评分 + 反馈 + rubric 维度得分 |
| **所需 RAG** | student-level (该学生历次提交) + course-level (课程知识点) |
| **输出产物** | 学生画像卡片（强项/弱项/趋势/建议）、给教师的关注提醒 |
| **MVP 实现** | 基于已有评分数据做简单趋势图 + LLM 总结 |
| **长期演进** | 早期预警（成绩下滑预测）、个性化反馈模板、学生自助查看 |

#### Agent 7: Email Triage Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 对收到的邮件进行智能分类、紧急度判断、意图识别、实体提取 |
| **所需工具** | `email_fetch`, `llm_call`, `entity_extract`, `rag_retrieve` |
| **所需数据** | 邮件正文 + 发件人信息 + 课程/学生列表 + 历史邮件线程 |
| **所需 RAG** | course-level (识别邮件提到的课程/作业) + student-level (识别发件人身份) |
| **输出产物** | 邮件分类标签 + 紧急度 + 意图 + 关联实体 + 建议动作 |
| **风险点** | 误分类导致紧急邮件被延处理 → 未知类别默认标高优先级 |
| **MVP 实现** | 拉取邮件后 → LLM 单次分类 → 返回标签 + 紧急度 |
| **长期演进** | 规则 + LLM 混合分类、学习教师的分类偏好、自动创建待办任务 |

#### Agent 8: Email Reply Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 基于邮件内容 + 课程上下文 + 学校政策，草拟回复建议 |
| **所需工具** | `llm_call`, `rag_retrieve`, `email_draft`, `teacher_pref_lookup` |
| **所需数据** | 邮件线程 + 课程信息 + 学生记录 + 学校政策文档 + 教师回复风格 |
| **所需 RAG** | course-level + policy-level + teacher-preference |
| **输出产物** | 3 种风格回复草稿 + 引用来源 + 风险提示（如涉及成绩需谨慎） |
| **风险点** | **自动发送错误回复是灾难性事故** → 必须人工审核 |
| **MVP 实现** | LLM 生成草稿 → 显示在 UI → 教师编辑 → 确认后调用 Gmail send |
| **长期演进** | 低风险邮件（如"收到""好的"类）可半自动、模板库进化、审批流 |
| **人在回路** | **强制**。所有回复必须经教师确认后发送 |

#### Agent 9: Content Generation Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 统一编排 Sub1(PPT)、Sub2(题目)、Sub4(图表) 的内容生成能力 |
| **所需工具** | `ppt_generate`, `question_generate`, `diagram_generate`, `llm_call`, `rag_retrieve` |
| **所需数据** | 课程文档、教学大纲、目标知识点、已有题库 |
| **所需 RAG** | course-level (教学材料) |
| **输出产物** | PPT/题目/图表 —— 但与课程知识对齐、与教学进度关联 |
| **MVP 实现** | 在现有 Sub1/Sub2/Sub4 基础上加 course context 参数 |
| **长期演进** | "输入一节课主题 → 自动生成 PPT + 课后习题 + 复习图表"一键教学内容包 |

#### Agent 10: Diagram / Image Knowledge Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 从提交中提取图表/公式，理解视觉内容，支持批改中对图表的评价 |
| **所需工具** | `image_extract`, `ocr`, `vision_llm`, `diagram_search` |
| **所需数据** | submission PDF 中的图表、课程参考图表 |
| **所需 RAG** | course-level (参考图表库) |
| **输出产物** | 图表识别结果 + 对标参考图的评价 + 改进建议 |
| **MVP 实现** | 当前 Sub3+Sub4 合并 + 增加 vision model 调用 |
| **长期演进** | 图表质量评分、多模态 RAG、图表版本对比 |

#### Agent 11: Admin Ops Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 自然语言驱动的管理操作：查询数据库、导出报表、批量更新 |
| **所需工具** | `db_query`, `db_export`, `user_manage`, `course_manage` |
| **所需数据** | MongoDB 全库 |
| **输出产物** | 查询结果 + 操作确认 + 审计日志 |
| **风险点** | **SQL/NoSQL 注入风险** → 必须沙箱化，只允许读和白名单写 |
| **MVP 实现** | 当前 DB Console 加 NL2Query 能力 |
| **长期演进** | 自助报表生成、异常数据告警 |

#### Agent 12: Supervisor / Orchestrator Agent

| 维度 | 内容 |
|------|------|
| **核心场景** | 协调多 Agent 协作场景，如"收到学生邮件 → 识别是作业问题 → 检索该学生提交记录 → 草拟回复" |
| **所需工具** | 调用其他所有 Agent |
| **所需数据** | 全局上下文 |
| **输出产物** | 编排后的完整工作流结果 |
| **MVP 实现** | 简单的 if-else 路由（根据任务类型分发到对应 Agent） |
| **长期演进** | LLM-based planning → tool selection → execution → reflection loop |
| **人在回路** | 高风险动作（发邮件、修改成绩、删除数据）必须人工确认 |

### 4.3 Agent 协作场景示例

**场景：收到一批新提交**
```
1. Submission Triage Agent
   → 批量扫描 30 份 submission
   → 输出：5 份"AI 高置信度可自动批改"，20 份"正常"，5 份"需重点关注"

2. Grading Agent（高置信度组）
   → 自动跑完整批改流程
   → 输出评分 + 反馈草稿 + 置信度
   → 教师批量审阅（只看异常项）

3. Grading Agent + Feedback Agent（正常组）
   → 教师逐份批改时，AI 同步生成反馈建议
   → 教师可一键采纳或编辑

4. Course Knowledge Agent（重点关注组）
   → 检索课程知识库，识别这些 submission 的共性问题
   → 生成"班级共性问题汇总"报告

5. Email Reply Agent
   → 对需要反馈的学生，自动草拟个性化邮件
   → 教师审核后群发
```

**场景：收到学生邮件"请问HW3什么时候交？"**
```
1. Email Triage Agent
   → 分类：课程事务 | 紧急度：低 | 意图：查询截止日期
   → 关联实体：{course: comp1001, assignment: hw3, student: 2024001}

2. Course Knowledge Agent
   → 检索 hw3 的 dueDate

3. Email Reply Agent
   → 草拟回复："Hi [student name], HW3 的截止日期是 [date]，请按时提交。"
   → 标记为"低风险，建议自动发送"

4. 教师审核（可跳过低风险项）→ 发送
```

---

## 五、RAG 升级方案

### 5.1 当前 RAG 局限诊断

| 局限 | 具体问题 | 影响 |
|------|----------|------|
| **单 submission 孤岛** | 每次检索仅在当前 submission 的 chunks 中搜索 | 无法利用历次反馈、同作业其他学生共性问题 |
| **无 metadata filtering** | 所有 chunks 地位平等，无法按 rubric 维度、页码、段落类型筛选 | 检索噪音，与当前批改维度不对齐 |
| **chunk 策略过于简单** | 固定 800 chars + 120 overlap | 可能在关键段落中间断开，丢失语义完整性 |
| **无查询改写** | 用户选中的文本直接当 query | 短文本或上下文不足时检索效果差 |
| **无 rerank** | 仅靠 TF-IDF cosine 或 dense similarity 排序 | top-K 质量不稳定 |
| **无评测** | 无 golden dataset、无 retrieval metrics | 不知道 RAG 到底在帮忙还是添乱 |
| **无缓存** | 每次批改都重新编码查询 | 同一 assignment 重复消耗资源 |
| **无引用回溯** | 返回的 chunks 不带页码/位置信息 | 教师无法验证 AI 反馈的依据 |

### 5.2 分层知识库架构

```
┌────────────────────────────────────────────────┐
│              Knowledge Layers                   │
├──────────────┬─────────────────────────────────┤
│ Level 6      │ Institution / Policy             │
│              │ 学校教学政策、学术诚信规范、      │
│              │ 评分标准框架                       │
├──────────────┼─────────────────────────────────┤
│ Level 5      │ Teacher Preference               │
│              │ 教师反馈风格、常用评语库、         │
│              │ 个人 rubric 偏好                  │
├──────────────┼─────────────────────────────────┤
│ Level 4      │ Student Profile                  │
│              │ 学生历次提交、进步趋势、           │
│              │ 薄弱知识点                        │
├──────────────┼─────────────────────────────────┤
│ Level 3      │ Course Level                     │
│              │ 教学大纲、课件、参考资料、         │
│              │ 教学目标矩阵                      │
├──────────────┼─────────────────────────────────┤
│ Level 2      │ Assignment Level                 │
│              │ 作业要求、Rubric、标准答案、       │
│              │ 同批 submission 共性问题           │
├──────────────┼─────────────────────────────────┤
│ Level 1      │ Submission Level                 │
│              │ 单份提交的全文 chunks              │
│              │ （当前已有）                       │
└──────────────┴─────────────────────────────────┘
```

### 5.3 Chunking 策略升级

| Chunk 类型 | 策略 | 适用场景 |
|------------|------|----------|
| **语义段落块** | 按段落边界切分，SmallChunk (200-400) + LargeChunk (800-1200) 双层 | 默认策略，适合长文本 |
| **页面块** | 按 PDF 页切分，保留页码 metadata | 快速定位、引用回溯 |
| **Rubric 对齐块** | 按 rubric 维度关键词做 overlap-aware 切分 | 结构化评分场景 |
| **结构化块** | 代码块、表格、公式单独提取为独立 chunk | 编程/数学类作业 |
| **Parent-Child** | 大块（800）作 parent，小块（200）作 child；检索时 match child → 返回 parent | 兼顾精度和上下文 |

**实施方式**：在当前 `langchain_rag_service.py` 的 `RecursiveCharacterTextSplitter` 基础上：
1. 加入段落检测（`\n\n` 优先切分）
2. 每个 chunk 记录 `{page_num, start_char, end_char, chunk_type}` metadata
3. 引入 parent-child 分层（LangChain 的 `ParentDocumentRetriever`）

### 5.4 检索增强策略

| 策略 | 实现方式 | 优先级 |
|------|----------|--------|
| **Metadata Filtering** | Chroma/Qdrant where 子句，按 rubric_dimension, page_num, chunk_type 筛选 | **P0** |
| **Query Rewriting** | 用 LLM 将教师选中文本 + 当前 rubric 维度 → 改写为更好的检索查询 | **P0** |
| **Hybrid Retrieval** | BM25 (sparse) + Dense embedding + 加权融合 | **P1** |
| **Reranking** | 检索 top-20 → Coze/小模型 rerank → 返回 top-3 | **P1** |
| **Multi-hop** | 先检索 submission chunk → 再用 chunk 关键词检索 assignment-level 知识 | **P2** |
| **Citation Grounding** | 每条反馈附带 chunk 来源 + 页码 + 高亮位置 | **P0** |
| **Cross-document** | 检索同 assignment 其他 submission 的 chunks（匿名化） | **P2** |

### 5.5 不同任务类型的 RAG 策略

| 任务 | 检索层级 | 关键 metadata | 特殊策略 |
|------|----------|---------------|----------|
| 批改反馈 | L1 + L2 + L5 | rubric_dimension, page_num | Query = 选中文本 + rubric 维度 |
| 批注建议 | L1 + L2 | section_type, page_num | 就近检索（同页/同段优先） |
| 邮件回复 | L2 + L3 + L4 + L6 | course_id, student_id | Entity-aware retrieval（先识别邮件中提到的课程/作业） |
| 课程问答 | L3 + L6 | topic, week_num | 教学大纲优先 |
| 题目生成 | L2 + L3 | knowledge_point, difficulty | 已有题库去重检索 |
| 图表评价 | L1 (图表类 chunks) + L3 | chunk_type=diagram | Vision + text 联合检索 |

### 5.6 RAG 作为 Agent 能力（而非独立接口）

**当前**：`/api/ai/feedback` → 在 service 层手动调 RAG → 拼 prompt → 调 Coze

**目标**：
```python
# Agent 的 tool 定义
@tool_registry.register("rag_retrieve")
async def rag_retrieve(
    query: str,
    knowledge_levels: list[str],  # ["submission", "assignment", "teacher_pref"]
    metadata_filter: dict,         # {"rubric_dimension": "correctness"}
    top_k: int = 5,
    rerank: bool = True
) -> list[RetrievalResult]:
    """Agent 可自主决定检索什么层级、什么 metadata、是否 rerank"""
    ...
```

Agent 在 planning 阶段自主决定：
- 这个任务需要检索哪些知识层级
- 用什么 metadata filter
- 是否需要 multi-hop
- 检索结果是否足够（不够则 re-query）

### 5.7 RAG 评测体系

| 指标 | 定义 | 采集方式 | 目标 |
|------|------|----------|------|
| **Retrieval Precision@3** | top-3 中有多少是相关的 | Golden dataset + 人工标注 | >0.7 |
| **Retrieval Recall** | 相关 chunk 是否被检索到 | Golden dataset | >0.8 |
| **Groundedness** | AI 反馈是否基于检索到的内容 | LLM-as-judge | >0.85 |
| **Hallucination Rate** | AI 生成了检索结果中没有的事实 | LLM-as-judge + 人工抽检 | <0.1 |
| **Answer Usefulness** | 教师是否采纳了 AI 建议 | 用户行为日志（采纳/编辑/驳回） | >0.5 |
| **Latency P95** | 从查询到返回的耗时 | 接口监控 | <3s |
| **Cost per Query** | 每次检索+生成的 API 成本 | LLM 调用日志 | 追踪即可 |

**Golden Dataset 构建**（P0，Phase 1 立刻做）：
1. 从已有 annotations 中选出 10 份高质量批改
2. 教师标注"这段反馈应该基于 submission 的哪些段落"
3. 作为 retrieval ground truth
4. 每月扩充，目标 Phase 2 结束时达到 100 条

### 5.8 知识管理

| 维度 | 策略 |
|------|------|
| **新鲜度** | 每次 submission 更新时重新 index；课程文档按 mtime 增量更新 |
| **版本控制** | 每个 knowledge chunk 带 version_id + created_at |
| **缓存** | 同 assignment 的 query embedding 缓存 24h（Redis） |
| **失效** | 课程文档更新时，对应 course-level 索引全量重建 |
| **清理** | 学期结束后，submission-level 索引可归档/删除，course-level 保留 |

### 5.9 RAG 改造优先级

| 优先级 | 改造项 | 预计工作量 |
|--------|--------|------------|
| **P0** | metadata filtering（chunk 带 page_num, rubric_dim） | 2-3 天 |
| **P0** | citation grounding（反馈带来源页码） | 2 天 |
| **P0** | query rewriting（LLM 改写查询） | 1 天 |
| **P0** | golden dataset + 评测脚本 | 3 天 |
| **P1** | assignment-level 知识库（同作业所有 submission 索引） | 5 天 |
| **P1** | hybrid retrieval (BM25 + dense) | 3 天 |
| **P1** | reranking（Coze 做 rerank，或 cross-encoder） | 2 天 |
| **P1** | teacher preference memory | 5 天 |
| **P2** | course-level 知识库 + 教师上传文档 | 7 天 |
| **P2** | parent-child chunking | 3 天 |
| **P2** | multi-hop retrieval | 5 天 |
| **P2** | student-level 知识库 | 5 天 |
| **P3** | 知识图谱层 | 15+ 天 |
| **P3** | policy-level 知识库 | 5 天 |

---

## 六、Email Agent 专项方案

### 6.1 当前 Gmail 模块薄弱点分析

| 薄弱点 | 当前状态 | 影响 |
|--------|----------|------|
| **Read-only** | 仅有 `auth_url`, `callback`, `list`, `message/{id}` 4 个接口 | 无法回复、无法发送、无法管理草稿 |
| **无智能分析** | 拉取邮件后原样展示 | 教师必须自己阅读每封邮件，无分类/摘要 |
| **无实体关联** | 邮件内容与课程/学生/作业完全脱节 | 无法自动建立上下文 |
| **无线程管理** | 每封邮件独立，无 thread 视图 | 丢失对话上下文 |
| **token 管理脆弱** | token 存 MongoDB（base64），无加密 | 安全隐患 |
| **无增量同步** | 每次 list 拉最近 10 封 | 无法做完整收件箱管理 |
| **前端超前** | UI 已有"回复"按钮、连接按钮、刷新 | 后端未匹配，点击无效 |

### 6.2 Email Agent 能力架构

```
┌─────────────────────────────────────────────┐
│           Email Agent Workspace              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │ Email Triage      │  │ Email Reply      │ │
│  │ Agent             │  │ Agent            │ │
│  │                   │  │                  │ │
│  │ • 智能分类         │  │ • 上下文理解      │ │
│  │ • 紧急度识别       │  │ • 草稿生成       │ │
│  │ • 意图提取         │  │ • 风格匹配       │ │
│  │ • 实体关联         │  │ • 人工审核       │ │
│  │ • 摘要生成         │  │ • 确认发送       │ │
│  └─────────┬────────┘  └────────┬─────────┘ │
│            │                    │            │
│  ┌─────────▼────────────────────▼─────────┐ │
│  │          Shared Capabilities            │ │
│  │  • Thread Memory (MongoDB)             │ │
│  │  • Course/Student Entity Resolution    │ │
│  │  • RAG: course + policy + student      │ │
│  │  • Attachment Parser + Knowledge Ingest│ │
│  │  • Audit Log                           │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │          Gmail API Integration          │ │
│  │  • OAuth2 (现有)                       │ │
│  │  • List/Get (现有)                     │ │
│  │  • Send (待实现)                       │ │
│  │  • Draft (待实现)                      │ │
│  │  • Labels (待实现)                     │ │
│  │  • Watch/Push Notification (长期)      │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 6.3 核心能力清单与实现路径

| 能力 | v1 (0-2月) | v2 (2-6月) | v3 (6-12月) |
|------|-----------|-----------|-------------|
| **邮件拉取** | 增量同步 + pageToken 翻页 | 实时推送 (Gmail Push) | 多账号聚合 |
| **智能分类** | LLM 单次分类（5 类：作业、成绩、课程事务、行政、其他） | 规则 + LLM 混合，支持自定义标签 | 学习教师分类偏好 |
| **紧急度识别** | 关键词 + LLM（高/中/低） | 结合截止日期、发件人角色 | 预测性紧急度 |
| **意图识别** | LLM 提取（查询、请求、投诉、通知、闲聊） | 多意图识别 | 意图到动作的自动映射 |
| **实体关联** | 邮件正文中匹配 course/assignment/student 名称 | NER + 模糊匹配 | 知识图谱级关联 |
| **摘要** | 每封邮件一句话摘要 | 线程级摘要 | 按课程/学生维度聚合摘要 |
| **建议回复** | 3 种风格草稿 | 基于教师历史回复学习风格 | 模板库 + 动态生成 |
| **草稿管理** | 保存到 Gmail Draft | 教师编辑 → 确认 → 发送 | 定时发送、批量发送 |
| **附件解析** | PDF/DOCX 文本提取 | 入知识库 | 自动关联到 submission |
| **线程记忆** | 线程 ID 关联历史 | MongoDB 持久化 + 上下文窗口 | 长期关系记忆 |
| **任务流转** | 标记为"待处理"→ 待办列表 | 邮件 → Grading 工作台联动 | 邮件 → 工单系统 |

### 6.4 教师可控的自动化设计

```
自动化级别          适用场景                    控制机制
────────────────────────────────────────────────────────
建议模式 (默认)     所有邮件                    AI 分析 + 建议 → 教师决策
                                               (不做任何自动操作)

半自动模式          低风险确认类邮件             AI 生成草稿 → 教师一键确认
                   ("收到""好的""我知道了")     → 发送
                                               教师可设置白名单类型

全自动模式          仅限教师显式配置的场景        自动分类 + 自动标签
(限低风险)          如：自动回复已读确认          执行后通知教师
                   自动归档通知类邮件             教师可随时关闭
```

### 6.5 邮件自动/人工介入判断矩阵

| 邮件类型 | 风险等级 | 处理方式 |
|----------|----------|----------|
| 课程通知确认（"收到"） | 极低 | 可全自动 |
| 截止日期查询 | 低 | 半自动（AI 草稿→教师确认） |
| 作业常规问题 | 低 | 半自动 |
| 成绩争议/申诉 | **高** | **必须人工处理**，AI 仅提供背景信息 |
| 请假/延期请求 | 中 | 半自动，但必须人工确认 |
| 投诉类邮件 | **高** | **必须人工处理** |
| 心理健康/紧急求助 | **极高** | **立即通知教师 + 学校支持部门** |
| 行政部门邮件 | 中 | 建议模式 |
| 未知类型 | **默认高** | 人工处理 |

### 6.6 合规与隐私

| 维度 | 措施 |
|------|------|
| **数据存储** | Gmail token 加密存储（AES-256）；邮件内容只缓存 metadata，不长期存正文 |
| **权限最小化** | Gmail scope 精确到 `gmail.readonly` + `gmail.send`，不申请全权限 |
| **审计日志** | 每次 AI 操作（分类/草稿/发送）记录到 agent_logs |
| **误发防护** | 发送前二次确认 UI；发送后 30s 撤回窗口（利用 Gmail scheduled send） |
| **学生数据保护** | 邮件中的学生信息不存入公共知识库，仅存入对应教师的私有记忆 |
| **数据保留** | 邮件缓存 30 天自动清理，可配置 |

### 6.7 Email Agent 演进路线

**v1：邮箱助手（0-2 个月）**
```
能力边界：
- 增量拉取邮件列表（支持翻页）
- 查看邮件详情 + 一句话摘要
- 智能分类（5 类）+ 紧急度标签
- 基础实体关联（匹配课程名、学生名）
- 教师可在页面中写回复，调用 Gmail send API 发送

商业价值：
- 教师邮箱打开率提升 → 日活入口
- 节省教师每天 15-30 分钟的邮件浏览时间
- 作为产品"智能化"的可见亮点，适合做 demo
```

**v2：邮件代理（2-6 个月）**
```
能力边界：
- 建议回复（3 种风格草稿）
- 线程上下文理解
- 课程/作业/学生实体精确关联
- 附件解析 + 知识入库
- 优先级队列工作台视图
- 半自动模式（教师一键确认常规回复）
- 邮件 → 待办任务联动

商业价值：
- 教师邮件回复效率提升 3-5x
- 形成高频使用习惯（教师每天必打开）
- 差异化卖点：其他批改工具没有邮件能力
```

**v3：教学沟通中枢（6-12 个月）**
```
能力边界：
- 多账号邮箱聚合
- 自动化规则引擎（教师自定义触发条件 + 动作）
- 邮件→批改工作台→成绩发布→邮件通知的完整闭环
- 学生沟通历史画像
- 群发个性化反馈邮件
- 集成即时通讯（Slack/Teams/钉钉）
- 沟通数据分析仪表板

商业价值：
- 成为教师教学沟通的主要工具（替代原生 Gmail 客户端）
- 组织级采购核心功能
- 沟通数据沉淀形成护城河
```

### 6.8 后端需要补齐的 Gmail 接口

| 接口 | 方法 | 功能 | 优先级 |
|------|------|------|--------|
| `/api/gmail/send` | POST | 发送邮件（新增） | **P0** |
| `/api/gmail/reply/{thread_id}` | POST | 在线程中回复 | **P0** |
| `/api/gmail/draft` | POST | 创建草稿 | P1 |
| `/api/gmail/draft/{id}/send` | POST | 发送草稿 | P1 |
| `/api/gmail/list` | GET | 增加 pageToken + maxResults + query 参数 | **P0** |
| `/api/gmail/thread/{id}` | GET | 获取完整邮件线程 | **P0** |
| `/api/gmail/classify` | POST | AI 智能分类 + 摘要 | **P0** |
| `/api/gmail/labels` | GET/POST | 标签管理 | P2 |
| `/api/gmail/attachments/{msg_id}/{att_id}` | GET | 下载附件 | P1 |
| `/api/gmail/suggest_reply/{msg_id}` | POST | AI 生成建议回复 | **P0** |

---

## 七、各模块逐项优化建议

### A. Grading Mailbox + Grading Workbench

| 维度 | 分析 |
|------|------|
| **本质问题** | 教师批改作业的效率太低，需要逐份打开、逐段阅读、手写反馈 |
| **为何还不是产品** | 没有批量操作、没有优先级、没有预审分流、没有教师偏好学习、数据存在 JSON 文件中无法迭代 |
| **最应新增的核心功能** | ① 批量预审 + Triage Dashboard ② 置信度分级显示 ③ 反馈建议带引用来源 ④ 教师反馈风格学习 ⑤ 同 assignment 共性问题汇总 |
| **应改造成的 Agent** | Grading Agent + Feedback Agent + Submission Triage Agent 三合一工作台 |
| **接入统一知识库** | 批改时自动检索 assignment-level 知识（rubric + 历次反馈 + 课程目标） |
| **数据闭环** | 教师每次采纳/修改/驳回 AI 建议 → 回流到教师偏好模型 + RAG 评测数据 |
| **商业化** | **核心付费功能**。免费版限制 AI 辅助次数/月，付费版无限制 + 批量预审 |
| **与其他模块联动** | ← Email Agent（收到学生问题邮件直接跳转对应 submission）<br>← Course Knowledge（课程目标对标评分）<br>→ Student Progress（评分数据流入学生画像） |
| **应砍掉/简化** | 当前 PDF 标注的"点击放置 label"交互过于原始，应改为 PDF 文内选中文本 → 弹出 annotation panel |

| 优先级 | 优化项 |
|--------|--------|
| **P0** | annotations 从 JSON 迁入 MongoDB |
| **P0** | 反馈建议增加引用来源（chunk 页码 + 高亮） |
| **P0** | 置信度分级（高/中/低）显示在每条 AI 建议旁 |
| **P1** | 批量预审 Triage Dashboard |
| **P1** | 教师反馈风格 prompt 参数化 |
| **P1** | 同 assignment 共性问题面板 |
| **P2** | 多教师协作批改 |
| **P2** | 标注交互重构（文本选中模式） |

### B. AI Chat / AI Interaction

| 维度 | 分析 |
|------|------|
| **本质问题** | 教师/学生需要一个通用 AI 问答入口 |
| **为何还不是产品** | 通用聊天没有差异化，与 ChatGPT 直接竞争无意义；缺少课程上下文 |
| **最应新增的核心功能** | ① 绑定课程上下文（在某门课下聊天 → 自动挂载课程知识库）② 支持 @ 引用 submission / assignment ③ 历史对话可检索 |
| **应改造成的 Agent** | **Course Assistant Agent**——不再是通用聊天，而是课程专属 AI 助手 |
| **接入统一知识库** | 当前选中课程的 course-level RAG + assignment-level RAG |
| **数据闭环** | 教师/学生提问 → 识别知识盲区 → 反馈到课程知识库补全 |
| **商业化** | 学生端课程助手（B2B2C 模式，学校采购后学生免费用） |
| **应砍掉/简化** | Gemini 嵌入面板（首页 AI Space tab）如果和 AI Interaction 重复，应合并为一个入口 |

| 优先级 | 优化项 |
|--------|--------|
| **P0** | 加入课程上下文切换器（当前在哪门课下对话） |
| **P1** | RAG 接入（课程知识库作为上下文） |
| **P1** | 合并首页 AI Space 和 AI Interaction 为统一入口 |
| **P2** | 学生端开放（学生可问课程相关问题） |

### C. Email Agent / AI Email → 统一为 "Email Agent"

| 维度 | 分析 |
|------|------|
| **本质问题** | 教师被教学邮件淹没，回复重复性高、上下文切换成本大 |
| **为何还不是产品** | 后端只有 4 个 read-only 接口，前端 UI 超前但无法实际操作 |
| **最应新增的核心功能** | 见第六节 Email Agent 专项方案 |
| **应砍掉/合并** | **AI Email (`/ai-email`) 和 Email Agent (`/email-agent`) 必须合并为一个入口** |

| 优先级 | 优化项 |
|--------|--------|
| **P0** | 合并两个入口为统一 `/email` |
| **P0** | 补齐 send/reply/thread 后端接口 |
| **P0** | 智能分类 + 摘要 |
| **P1** | 建议回复 |
| **P1** | 线程视图 |
| **P2** | 附件解析入知识库 |
| **P2** | 自动化规则引擎 |

### D. Slides Generator (Sub1)

| 维度 | 分析 |
|------|------|
| **本质问题** | 教师需要快速从教材/论文中提取内容生成课件 |
| **为何还不是产品** | MD → PPT 的转化质量依赖模板，模板有限；缺少课程知识对齐 |
| **最应新增的核心功能** | ① 基于课程教学大纲自动建议 PPT 结构 ② 支持更多输出格式 ③ 演讲稿同步生成 |
| **应改造成的 Agent** | Content Generation Agent 的子能力 |
| **接入统一知识库** | 课程文档 + 教学大纲 → 自动对齐教学进度 |
| **商业化** | "教学内容生产平台"业务线的核心功能之一 |
| **与其他模块联动** | ← Course Knowledge（教学大纲驱动 PPT 结构）<br>→ Question Generator（PPT 完成后自动生成配套习题） |

| 优先级 | 优化项 |
|--------|--------|
| **P1** | 课程上下文参数（知道当前是第几周、什么知识点） |
| **P2** | PPT 质量提升（更多模板 + AI 排版建议） |
| **P2** | "一键教学包"（PPT + 习题 + 复习图）联动 |

### E. Question Generator (Sub2)

| 维度 | 分析 |
|------|------|
| **本质问题** | 教师出题耗时，需要从已有材料中提取/生成习题 |
| **为何还不是产品** | 题目质量参差不齐、无题库管理、无去重、无与课程知识点对齐 |
| **最应新增的核心功能** | ① 题库管理（增删改查 + 标签）② 知识点对齐 ③ 难度分布可视化 ④ 与 Rubric 联动 |
| **应改造成的 Agent** | Content Generation Agent 的子能力 |
| **数据闭环** | 生成的题目 → 用在 assignment 中 → 学生答题数据反馈 → 调整出题策略 |
| **商业化** | 题库 SaaS（按课程/学科售卖题库）|

| 优先级 | 优化项 |
|--------|--------|
| **P1** | 题库持久化（MongoDB 存储，而非临时 session） |
| **P1** | 知识点标签 + 课程大纲对齐 |
| **P2** | 难度分布分析 + 自动平衡 |
| **P2** | 与 assignment 联动（一键用到作业中） |

### F. Image Extract System (Sub3) → 合并入 Visual Tool

| 维度 | 分析 |
|------|------|
| **本质问题** | 从 PDF 中提取图片用于课件/资料 |
| **为何应该合并** | 与 Sub4 (Diagram Tool) 功能高度重叠——都是处理视觉内容。独立存在让用户困惑 |
| **合并方案** | Sub3 的图片提取 + Sub4 的图表搜索/生成 → 统一 "Visual Tool" 或 "AI Diagram & Image" |

| 优先级 | 优化项 |
|--------|--------|
| **P0** | 合并 Sub3 和 Sub4 为统一入口 |
| **P1** | Vision LLM 图像理解（批改中识别学生提交的图表） |

### G. Diagram Tool (Sub4) → 合并后继承

| 维度 | 分析 |
|------|------|
| **最应新增的核心功能** | ① SVG 在线编辑器增强 ② AI 生成质量提升 ③ 图表库管理 |
| **注意** | 当前 LaTeX/TikZ 生成依赖本地 pdflatex 且路径硬编码 Windows 路径，需修复 |

| 优先级 | 优化项 |
|--------|--------|
| **P1** | 修复 pdflatex 跨平台路径问题 |
| **P2** | 在线 SVG 编辑器 → 可嵌入 PPT 和习题 |

### H. Admin Dashboard / DB Console

| 维度 | 分析 |
|------|------|
| **本质问题** | 平台管理者需要管理用户、课程、数据 |
| **为何还不是产品** | 管理功能零散，DB Console 是给开发者的调试工具而非管理产品 |
| **最应新增的核心功能** | ① 数据概览仪表板 ② 批量操作 ③ 操作审计日志 ④ 学期管理（开学/结课批量操作）|
| **安全风险** | **DB Console 允许任意 MongoDB 查询，即使限制了 admin 角色，也是极高风险** → 应增加白名单命令、只读模式、操作日志 |

| 优先级 | 优化项 |
|--------|--------|
| **P0** | DB Console 增加安全沙箱（白名单查询、禁止 drop/delete） |
| **P1** | 数据概览仪表板（用户数、课程数、批改进度、AI 使用量） |
| **P2** | 学期管理工作流 |
| **P3** | NL2Query Admin Agent |

### I. Student Home / Teacher Home / Profile

| 维度 | 分析 |
|------|------|
| **本质问题** | 角色化首页和个人中心 |
| **最应新增的核心功能** | ① 教师首页增加"今日待办"（待批改 + 待回复邮件 + Agent 通知）② 学生首页增加"我的课程进度 + AI 学习建议" ③ Profile 增加偏好设置（AI 反馈风格、自动化级别）|

| 优先级 | 优化项 |
|--------|--------|
| **P1** | 教师首页"今日待办"面板 |
| **P1** | Profile 增加 AI 偏好设置 |
| **P2** | 学生进度仪表板 |

---

## 八、业务发展与商业化方向

### 8.1 业务线全景

| # | 业务线 | 目标用户 | 用户痛点 | 差异化价值 | 数据护城河 | 商业模式 | 上线顺序 |
|---|--------|----------|----------|------------|------------|----------|----------|
| 1 | **智能批改 SaaS** | 高校教师 | 批改耗时、反馈重复、标准不一致 | 知识驱动的 AI 批改 + rubric 校准 | 课程级反馈语料库 + 教师偏好模型 | B2C 订阅（$15-30/月/教师）或 B2B 校级 | **第一个** |
| 2 | **教师教学工作台** | 高校教师 | 批改+沟通+备课分散在多个工具 | 统一工作台，一个平台搞定 | 教师使用行为 + 教学数据 | B2B 院系级采购（$2000-5000/年/院系） | 第二个 |
| 3 | **教学邮件与沟通代理** | 高校教师 | 邮件淹没、重复回复、上下文丢失 | 课程上下文感知的邮件 Agent | 教学沟通语料 + 回复模板 | 工作台增值模块 | 与 #2 打包 |
| 4 | **课程知识运营平台** | 课程团队 | 教学资源分散、知识未沉淀 | 自动知识提取 + 结构化知识库 | 课程知识图谱 | B2B 按课程收费 | 第三个 |
| 5 | **教学内容生产平台** | 教师+助教 | 课件/习题制作耗时 | AI 一键生成教学包 | 题库 + 课件模板库 | 按用量计费 | 与 #4 打包 |
| 6 | **学生学习支持 Agent** | 学生 | 课程问题找不到人问、反馈不及时 | 7*24 课程 AI 助手 | 课程知识库 + 学生交互数据 | B2B2C（学校买，学生用） | 第四个 |
| 7 | **课程管理与教学运营 Agent** | 院系管理者 | 教学质量不透明 | 教学质量仪表板 + AI 分析 | 全院系教学数据 | B2B 院系级 | 长期 |
| 8 | **高校院系级 AI 教学基础设施** | CIO/IT 部门 | 各部门各自建 AI 系统 | 统一 AI 教学中台 | 全校数据 | B2B 大客户 | 远期 |

### 8.2 关键商业判断

| 问题 | 答案 |
|------|------|
| **最先如何切入市场** | 智能批改 SaaS，面向 20-50 人班级规模的高校课程教师，免费提供基础批改工具 + AI 试用额度 |
| **最有机会形成复购和高频** | 教师教学工作台（批改 + 邮件双入口，日活>周活) |
| **最有机会形成组织级采购** | 院系级 AI 教学基础设施（但这是 12+ 个月后的目标） |
| **最适合做 AI Agent 旗舰能力** | 邮件 Agent——最直观展示 AI Agent 的主动性和上下文理解 |
| **先做内部工具还是外部 SaaS** | 先做 1-2 所试点学校的内部部署，验证 PMF → 再 SaaS 化 |

### 8.3 定价策略建议

```
免费版 (Individual Teacher)：
- 3 门课程
- 每月 50 次 AI 辅助批改
- 邮件查看（无 AI 分析）
- 基础 PPT/题目生成

Pro 版 ($20/月/教师)：
- 无限课程
- 无限 AI 辅助批改
- Email Agent（分类 + 建议回复）
- 教师偏好学习
- 课程知识库（每课程 500MB 文档）

Team 版 ($100/月/5人)：
- Pro 全部功能
- 多教师协同批改
- Rubric 校准报告
- 学生进度仪表板
- 共享课程知识库

Campus 版 (定制报价)：
- 全部功能
- 私有化部署
- SSO 集成
- 数据安全合规
- 定制 Agent 工作流
```

---

## 九、0-18 个月路线图

### Phase 1：基础设施 + 核心闭环加固（0-2 个月）

| 维度 | 具体动作 |
|------|----------|
| **核心目标** | 数据层统一 + 批改主线加固 + Email Agent v1 上线 |
| **产品动作** | ① 合并 AI Email + Email Agent → 统一入口 ② 合并 Sub3 + Sub4 → Visual Tool ③ 教师首页加"今日待办" ④ Grading Workbench 增加置信度标签 |
| **技术动作** | ① courses.json → MongoDB 全量迁移 ② annotations JSON → MongoDB ③ 删除 SQLite/Flask 遗留代码 ④ 引入 Redis（session + cache） ⑤ Prompt 从代码中提取到 YAML 文件 ⑥ 统一 LLM Router（Coze/DeepSeek 路由 + fallback） |
| **数据动作** | ① MongoDB 统一 schema 设计 ② 建立 data migration 脚本 ③ 为每个 API 调用加 telemetry（调用次数、耗时、成本） |
| **Agent 动作** | ① 定义 Agent 基类和 Tool Registry 接口 ② Grading Agent MVP（现有 analyze 改成 Agent 模式 + 置信度） |
| **RAG 动作** | ① chunk metadata（page_num, rubric_dim）② citation grounding ③ query rewriting ④ golden dataset 10 条 |
| **Email 动作** | ① 补齐 send/reply/thread API ② 智能分类 + 摘要 ③ 建议回复 MVP |
| **关键风险** | 数据迁移可能导致短暂不可用 → 写好回放脚本 |
| **成功指标** | ① 全量数据迁入 MongoDB ② Email Agent v1 可用 ③ RAG retrieval precision >0.5 ④ 教师批改端到端流程 100% 走 MongoDB |

### Phase 2：Agent 化 + 知识系统 + 产品打磨（2-6 个月）

| 维度 | 具体动作 |
|------|----------|
| **核心目标** | Agent 编排层上线 + 课程知识库 + 批量预审 + Email Agent v2 + 前端工作台化 |
| **产品动作** | ① 前端统一 Shell（侧边栏 + 全局 Course Context）② Submission Triage Dashboard ③ Email Agent v2（建议回复 + 线程 + 优先级队列）④ AI Chat → Course Assistant ⑤ 教师偏好设置页 |
| **技术动作** | ① Agent Orchestrator（轻量 DAG runner 或 LangGraph）② Tool Registry + Agent Registry ③ 前端 Zustand 全局状态 ④ 后端 domain 分层重构 ⑤ 异步任务队列（arq + Redis）|
| **数据动作** | ① agent_logs collection ② agent_memory collection（per-user, per-course）③ email_threads collection ④ 教师反馈行为日志（采纳/编辑/驳回）|
| **Agent 动作** | ① Submission Triage Agent ② Feedback Agent（带教师偏好）③ Email Triage Agent ④ Email Reply Agent ⑤ Course Knowledge Agent MVP |
| **RAG 动作** | ① assignment-level 知识库 ② hybrid retrieval (BM25 + dense) ③ reranking ④ teacher preference RAG ⑤ golden dataset → 50 条 ⑥ 自动 evaluation pipeline（CI 中跑） |
| **Email 动作** | ① 线程视图 + 上下文记忆 ② 附件解析 ③ semi-auto 模式 ④ 邮件→待办联动 |
| **关键风险** | Agent 编排复杂度 → 先做最简单的线性 Agent，避免过度设计 |
| **成功指标** | ① AI 建议采纳率 >40% ② 批改效率提升 30%（人均每小时批改份数）③ Email 回复效率提升 2x ④ RAG precision >0.7 ⑤ 至少 1 所试点学校在用 |

### Phase 3：产品化 + 商业化 MVP（6-12 个月）

| 维度 | 具体动作 |
|------|----------|
| **核心目标** | 产品稳定可对外商业化 + 学生端上线 + 教学内容联动 |
| **产品动作** | ① 学生端 Course Assistant（问课程问题 + 查自己反馈）② 一键教学包（PPT + 习题 + 图表）③ Rubric Calibration 仪表板 ④ Student Progress 仪表板 ⑤ Email Agent v3（沟通中枢）|
| **技术动作** | ① 多租户架构（school_id 维度隔离）② 对象存储迁移（MinIO/S3）③ 容器化部署（Docker Compose → K8s）④ CI/CD pipeline ⑤ 错误监控（Sentry）|
| **数据动作** | ① 学生画像数据模型 ② 题库持久化 ③ 教学质量指标聚合 |
| **Agent 动作** | ① Student Progress Agent ② Rubric Calibration Agent ③ Content Generation Agent ④ Supervisor Agent（跨 Agent 编排）|
| **RAG 动作** | ① course-level 知识库 ② student-level 知识库 ③ multi-hop retrieval ④ golden dataset → 100 条 |
| **成功指标** | ① 3-5 所学校试点 ② 付费转化率 >5% ③ 教师周活留存率 >60% ④ MRR > $2000 |

### Phase 4：规模化 + 高级 Agent（12-18 个月）

| 维度 | 具体动作 |
|------|----------|
| **核心目标** | 规模化运营 + 高级 Agent 能力 + 组织级产品 |
| **产品动作** | ① Campus 版（SSO + 私有化）② Admin Ops Agent ③ 教学质量分析报告 ④ 多语言支持 |
| **技术动作** | ① 知识图谱层 ② 多模态 RAG（图表/公式/代码）③ 模型微调（评测数据足够时）④ A/B 测试框架 |
| **成功指标** | ① 10+ 学校部署 ② MRR > $10000 ③ AI 建议采纳率 >60% |

---

## 十、优先级矩阵

### P0 — 立刻做（0-4 周）

| # | 事项 | 用户价值 | 商业价值 | 技术可行性 | 复杂度 | 风险 | Agent 一致性 |
|---|------|----------|----------|------------|--------|------|--------------|
| 1 | courses.json + annotations JSON → MongoDB | ★★★★★ | ★★★★☆ | ★★★★★ | 低 | 低 | ★★★★★ |
| 2 | 合并 AI Email + Email Agent 入口 | ★★★★☆ | ★★★☆☆ | ★★★★★ | 极低 | 无 | ★★★★☆ |
| 3 | 补齐 Gmail send/reply/thread API | ★★★★★ | ★★★★☆ | ★★★★☆ | 中 | 低 | ★★★★★ |
| 4 | RAG metadata filtering + citation grounding | ★★★★☆ | ★★★☆☆ | ★★★★★ | 低 | 低 | ★★★★★ |
| 5 | Prompt 提取到 YAML + 统一 LLM Router | ★★★☆☆ | ★★★☆☆ | ★★★★★ | 低 | 低 | ★★★★★ |
| 6 | DB Console 安全沙箱 | ★★☆☆☆ | ★★☆☆☆ | ★★★★★ | 极低 | **高（当前有安全风险）** | ★★☆☆☆ |
| 7 | 删除 SQLite/Flask 遗留代码 | ★☆☆☆☆ | ★☆☆☆☆ | ★★★★★ | 极低 | 无 | ★★★☆☆ |
| 8 | 引入 Redis（session + cache） | ★★★☆☆ | ★★☆☆☆ | ★★★★☆ | 低 | 低 | ★★★★☆ |
| 9 | Email 智能分类 + 摘要 | ★★★★★ | ★★★★☆ | ★★★★☆ | 中 | 低 | ★★★★★ |
| 10 | RAG golden dataset (10 条) + 评测脚本 | ★★★☆☆ | ★★★☆☆ | ★★★★★ | 低 | 无 | ★★★★★ |

### P1 — 第二波（1-3 个月）

| # | 事项 | 用户价值 | 商业价值 | 技术可行性 | 复杂度 |
|---|------|----------|----------|------------|--------|
| 11 | Submission Triage Agent（批量预审） | ★★★★★ | ★★★★★ | ★★★★☆ | 中 |
| 12 | Email 建议回复 + 线程视图 | ★★★★★ | ★★★★★ | ★★★★☆ | 中 |
| 13 | 前端统一 Shell + 全局 Course Context | ★★★★☆ | ★★★★☆ | ★★★☆☆ | 高 |
| 14 | Assignment-level RAG 知识库 | ★★★★☆ | ★★★★☆ | ★★★★☆ | 中 |
| 15 | 教师偏好记忆 + 反馈风格学习 | ★★★★☆ | ★★★★★ | ★★★☆☆ | 中 |
| 16 | 合并 Sub3 + Sub4 → Visual Tool | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | 低 |
| 17 | Grading Agent 置信度分级 | ★★★★☆ | ★★★★☆ | ★★★★☆ | 低 |
| 18 | AI Chat → Course Assistant (绑定课程) | ★★★★☆ | ★★★☆☆ | ★★★★☆ | 中 |
| 19 | 教师首页"今日待办"面板 | ★★★★☆ | ★★★☆☆ | ★★★★★ | 低 |
| 20 | Agent 基类 + Tool Registry | ★★★☆☆ | ★★★★☆ | ★★★★☆ | 中 |

### P2 — 第三波（3-6 个月）

| # | 事项 |
|---|------|
| 21 | Course-level 知识库 + 教师上传文档 |
| 22 | Student Progress Agent |
| 23 | 题库持久化 + 知识点对齐 |
| 24 | Email 附件解析入知识库 |
| 25 | 异步任务队列 (arq + Redis) |
| 26 | Hybrid Retrieval (BM25 + Dense) + Reranking |
| 27 | 后端 domain 分层重构 |
| 28 | 教师反馈行为日志采集 |
| 29 | 前端 Zustand 全局状态管理 |
| 30 | Email 半自动模式 |

### P3 — 远期（6+ 个月）

| # | 事项 |
|---|------|
| 31 | 多教师协同批改 |
| 32 | Rubric Calibration 仪表板 |
| 33 | 学生端 Course Assistant |
| 34 | 一键教学内容包（PPT + 习题 + 图表） |
| 35 | 多租户架构 |
| 36 | 知识图谱层 |
| 37 | 多模态 RAG |
| 38 | Admin Ops Agent (NL2Query) |
| 39 | Supervisor Agent（跨 Agent 编排） |
| 40 | 模型微调 |

---

## 十一、关键指标体系

### 批改效率指标

| 指标 | 定义 | 采集方式 | 短期/长期 |
|------|------|----------|-----------|
| **批改速度** | 平均每份 submission 批改耗时（分钟） | 前端打点：打开→提交时间差 | 短期目标 |
| **批改吞吐** | 每位教师每天完成批改份数 | 后端日志 | 短期目标 |
| **AI 分流效率** | Triage 后高置信度组的准确率 | 教师审核后覆盖率 | 中期 |

### 批改质量指标

| 指标 | 定义 | 采集方式 | 短期/长期 |
|------|------|----------|-----------|
| **反馈详细度** | 平均每份 submission 的标注数量 | MongoDB annotations count | 短期 |
| **Rubric 完整度** | 教师是否为每个 rubric 维度评分 | MongoDB rubric_scores completeness | 短期 |
| **评分一致性** | 同 assignment 不同教师的评分标准差 | 统计计算 | 中期 |

### AI 建议采纳率（**北极星指标**）

| 指标 | 定义 | 采集方式 | 短期/长期 |
|------|------|----------|-----------|
| **AI Suggestion Acceptance Rate** | 教师对 AI 反馈建议的采纳/编辑/驳回比例 | 前端打点：采纳按钮 vs 编辑 vs 驳回 | **北极星** |
| **AI Annotation Keep Rate** | AI 建议的标注中多少被教师保留到最终版 | 比较 AI 建议 vs 最终 annotations | 北极星 |

### RAG 指标

| 指标 | 定义 | 采集方式 |
|------|------|----------|
| **Retrieval Precision@3** | top-3 chunk 的相关度 | 离线评测（golden dataset） |
| **Groundedness Score** | AI 输出基于检索内容的程度 | LLM-as-judge（离线） |
| **RAG Cache Hit Rate** | 缓存命中率 | Redis 日志 |
| **RAG Latency P95** | 检索耗时 95 分位 | 接口日志 |

### 邮件处理指标

| 指标 | 定义 | 采集方式 |
|------|------|----------|
| **邮件分类准确率** | AI 分类 vs 教师修正后的分类 | 行为日志（教师是否修改了 AI 标签） |
| **回复草稿采纳率** | AI 草稿被直接发送 vs 编辑后发送 vs 丢弃 | 行为日志 |
| **邮件首次响应时间** | 从收到邮件到发出回复的平均时间 | Gmail 时间戳 |
| **未读邮件积压量** | 待处理邮件数量趋势 | 每日快照 |

### 用户指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **教师日活 (DAU)** | 每日至少使用 1 次的教师数 | 持续增长 |
| **教师周留存** | 本周活跃且下周仍活跃 | >60% |
| **课程渗透率** | 使用平台的课程数 / 教师总课程数 | >30% |
| **功能渗透率** | 使用批改以外功能的教师比例 | >20% |

### 商业化指标

| 指标 | 定义 |
|------|------|
| **MRR** | 月经常性收入 |
| **付费转化率** | 注册教师 → 付费教师 |
| **ARPU** | 每付费用户月均收入 |
| **LTV/CAC** | 用户终身价值 / 获客成本 |

---

## 十二、风险与反模式

### 反模式 1：过早堆模型和框架

**风险**：引入 LangGraph + CrewAI + Autogen + 向量数据库集群 + 消息队列...导致基础设施复杂度远超业务复杂度。

**当前项目已有信号**：同时依赖 Coze + DeepSeek + Zhipu + Anthropic + OpenAI + HuggingFace 6 个 AI 供应商，但只有 Coze 在核心链路中使用。

**规避**：
- 统一 LLM Router，当前只接 Coze 文本 API，其他作为 fallback
- Agent 编排先用简单 Python async 函数链，验证有效后再引 LangGraph
- 向量数据库继续用 Chroma，Qdrant 放到 Phase 3

### 反模式 2：过度 Agent 化导致不可控

**风险**：把所有功能都做成 Agent，但 Agent 之间交互不确定性太高，debug 困难。

**规避**：
- 先做单 Agent（Grading Agent、Email Triage Agent），验证单 Agent 可控后再做多 Agent
- 每个 Agent 必须有确定性的 fallback（Agent 失败 → 退化为规则/直接 LLM 调用）
- 高风险 Agent 动作（发邮件、修改成绩）必须有人工确认

### 反模式 3：RAG 成为昂贵的技术秀

**风险**：花大量时间做 RAG 工程，但教师感知不到质量提升。

**规避**：
- **评测先行**。先建 golden dataset，有指标后再改进 RAG
- 每次 RAG 改进必须有 A/B 评测数据支撑
- 关注"教师采纳率"而非"检索指标"

### 反模式 4：Email 自动回复导致事故

**风险**：AI 自动发出不当回复（错误成绩信息、不当措辞、隐私泄露）。

**规避**：
- **v1/v2 阶段绝不允许自动发送**，只生成草稿
- v3 仅对白名单类型（确认类）开放半自动
- 每封 AI 生成的邮件带醒目标记"AI Draft — 请审核"
- 发送后 30 秒撤回窗口
- 月度抽检 AI 草稿质量

### 反模式 5：工具太多但没有主线

**风险**：首页 7-8 个卡片，每个都半成品，用户不知道这个平台到底干什么。

**当前已有信号**：Sub1/Sub2/Sub3/Sub4 各自独立，与批改主线无关联。

**规避**：
- 首页重组：核心卡片（Grading + Email + Course Assistant）大卡突出显示
- 工具卡片（PPT/题目/图表）收进"Content Studio"子区域
- 入口数量压缩到 5 个以内

### 反模式 6：数据碎片化导致无法沉淀知识资产

**风险**：JSON 文件 + MongoDB + 本地 Chroma + 内存 Session + Gmail 实时拉取...5 种数据源，无法做联合分析。

**规避**：Phase 1 第一件事就是统一数据层

### 反模式 7：前端超前后端

**风险**：前端做了精美 UI，但后端接口不全，用户点了没反应。

**当前已有信号**：Email Agent UI 有回复按钮但后端无 send API；Admin Dashboard 有 UI 但接口不全。

**规避**：
- 每个新页面上线前必须有后端 API checklist
- 未实现的功能用 disabled + tooltip "Coming Soon" 而非假入口

### 反模式 8：无评测导致 AI 不可控

**风险**：看起来 AI 能得到答案，但不知道质量如何、是否有幻觉、是否一致。

**规避**：
- Phase 1 就建评测 pipeline
- 每周跑一次 RAG benchmark
- 每月做一次 AI 输出人工抽检（10 份）
- 建立"AI 输出质量周报"机制

---

## 十三、最应该立刻做的 10 件事

| # | 事项 | 预计工作量 | 做了之后的直接收益 |
|---|------|------------|-------------------|
| **1** | `courses.json` + `data/annotations/*.json` → MongoDB 全量迁移，写迁移脚本 | 3-5 天 | 所有数据可查询、可索引、可审计；解除最核心的技术债 |
| **2** | 建立 `prompts/` 目录，将所有硬编码 prompt 提取为 YAML 文件 + 统一加载器 | 2 天 | Prompt 可版本控制、可 A/B 测试、可快速迭代 |
| **3** | Grading Agent MVP——在现有 `/api/ai/analyze` 上增加置信度字段 + 批量模式 + 教师确认 UI | 5 天 | 教师可一次预审多份作业，高置信度的直接采纳 |
| **4** | RAG chunk 增加 metadata（page_num, rubric_dimension）+ 反馈带引用来源 | 3 天 | 教师可验证 AI 反馈依据，信任度大幅提升 |
| **5** | 补齐 Gmail `send`/`reply`/`thread` API + Email 智能分类 + 摘要 | 5 天 | Email Agent v1 闭环，教师终于可以在平台内回复邮件 |
| **6** | 前端侧边栏导航 + 全局 CourseContext + 合并重复入口 | 5 天 | 用户体验升级，"这是一个平台"而不是"一堆工具的集合" |
| **7** | RAG golden dataset（10 条）+ 评测脚本 | 2 天 | 有了基线数据，后续所有 RAG 优化都有据可依 |
| **8** | 教师偏好系统雏形——Profile 页增加"反馈风格"选择（简洁/详细/建设性）+ 传入 prompt | 2 天 | 最小成本实现个性化，直接提升采纳率 |
| **9** | 合并 Sub3→Sub4，合并 AI Email→Email Agent，首页入口精简 | 2 天 | 减少用户认知负担，平台定位更清晰 |
| **10** | 接口 telemetry（每次 LLM 调用记录 model、tokens、latency、cost 到 MongoDB） | 1 天 | 成本可见、性能可追踪、为后续优化提供数据 |

**总计约 30 天工作量，1-2 人全职可在 Phase 1（0-2 个月）内完成。**

---

> 本报告基于对项目代码库的深度审计，包括后端 12 个路由文件、6 个服务文件、前端 11 个页面组件以及完整的数据模型和配置分析。所有建议均结合项目实际代码状态给出，可直接作为产品和技术路线图讨论底稿。
