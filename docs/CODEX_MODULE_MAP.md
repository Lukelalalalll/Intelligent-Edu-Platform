# Codex 模块边界地图

> 目的：把这个仓库按“功能模块 -> 前端文件 -> 后端文件”拆清楚，方便后续让 Codex 按模块做优化时，边界足够明确，尽量少误伤共享层。

## 1. 总体结构

### 前端

- 主要业务模块都在 `frontend/src/features/*`
- 公共壳层和共享能力主要在：
  - `frontend/src/shared/*`
  - `frontend/src/router/*`
  - `frontend/src/types/*`
  - `frontend/src/api/*`（其中一部分是兼容层/转发层）

### 后端

- 核心聚合应用入口：
  - `backend/main.py`
  - `backend/apps/core.py`
- 独立子服务入口：
  - `backend/apps/slides.py`
  - `backend/apps/highlighter.py`
  - `backend/apps/questions.py`
  - `backend/apps/study_notes.py`
  - `backend/apps/visual.py`
  - `backend/apps/video.py`

### 后端挂载关系

| 后端入口 | 负责模块 |
| --- | --- |
| `backend/apps/core.py` | Auth / Profile、Admin、AI Interaction、Knowledge Base、Teacher Mailbox、Grading、AI Gateway、Chat、File Center、Homework |
| `backend/apps/slides.py` | Slides 主流程 |
| `backend/apps/highlighter.py` | Slides 高亮器 |
| `backend/apps/questions.py` | Question Bank / Question Generator |
| `backend/apps/study_notes.py` | Study Notes / Flashcards / Study Plan |
| `backend/apps/visual.py` | Diagram + Image Extractor |
| `backend/apps/video.py` | Video Generation |

## 2. 给 Codex 的边界使用原则

1. 默认先只允许 Codex 修改某个模块自己的 `features/`、`routes/`、`services/`、`repos/`。
2. `shared` / `core` / `infrastructure` / `history_service` / `file_asset_service` / `course_rag_service` 这类共享层，默认不要跟着一起动。
3. 如果一个前端模块只是“组合页”，要明确告诉 Codex 它依赖了哪些后端模块，不要让它误以为后端只有一个目录。

## 3. 模块地图

---

## M01. Auth 与 Profile

**前端**

- 路由：
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/profile`
- 主目录：
  - `frontend/src/features/auth/**`
- 强相关共享层：
  - `frontend/src/shared/store/useAuthStore.ts`
  - `frontend/src/shared/hooks/useAuthBootstrap.ts`
  - `frontend/src/shared/ProtectedRoute.tsx`
  - `frontend/src/shared/api/client.ts`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/auth_routes/router.py`
  - `backend/routes/auth_routes/__init__.py`
  - `backend/routes/auth_routes/auth.py`
  - `backend/routes/auth_routes/profile_courses.py`
  - `backend/routes/auth_routes/profile_history.py`
  - `backend/routes/auth_routes/profile_preferences.py`
  - `backend/routes/auth_routes/profile_ai_config.py`
  - `backend/routes/auth_routes/student_v2.py`
- 服务：
  - `backend/services/auth_account_service.py`
  - `backend/services/user_profile_service.py`
  - `backend/services/student_assignment_service.py`
  - `backend/services/security_audit.py`
- Schema：
  - `backend/schemas/auth.py`
- 相关仓储：
  - `backend/repositories/user_repo.py`
  - `backend/repositories/enrollment_repo.py`
  - `backend/repositories/assignment_repo.py`
  - `backend/repositories/submission_repo.py`

**边界说明**

- 登录/注册/会话/Profile 设置都属于这里。
- 学生端“我的课程/作业提交”接口也在这里的 `student_v2.py`，不要误归到 Mailbox。

---

## M02. 首页 / 应用壳层 / 导航

**前端**

- 路由：
  - `/`
- 主目录：
  - `frontend/src/features/home/**`
- 应用壳层：
  - `frontend/src/main.tsx`
  - `frontend/src/router/**`
  - `frontend/src/shared/Layout.tsx`
  - `frontend/src/shared/layout/**`
  - `frontend/src/shared/ScrollToTop.tsx`
  - `frontend/src/shared/NetworkBanner.tsx`

**后端**

- 没有独立后端模块。
- 首页里的 AI Chat Box 主要调用：
  - `backend/routes/ai_routes/chat.py`
  - `backend/routes/auth_routes/auth.py`

**边界说明**

- 这是一个前端组合模块。
- 优化首页时，通常不要顺手改 AI 主聊天工作区或 Auth 全局逻辑。

---

## M03. AI Interaction 工作台

**前端**

- 路由：
  - `/ai-interaction`
- 主目录：
  - `frontend/src/features/ai-interact/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/ai_routes/router.py`
  - `backend/routes/ai_routes/session.py`
  - `backend/routes/ai_routes/chat.py`
  - `backend/routes/ai_routes/memory.py`
- 服务：
  - `backend/services/ai_session_service.py`
  - `backend/services/ai_memory_service.py`
  - `backend/services/rag_service/rag_chat_pipeline.py`
  - `backend/services/web_search_service.py`
  - `backend/services/llm_service/**`
  - `backend/services/ai_gateway_service/**`
- 相关仓储：
  - `backend/repositories/ai_session_repo.py`

**边界说明**

- 这是主 AI 会话模块：会话列表、消息流式输出、记忆、Provider 健康检查都在这里。
- 它依赖共享的 RAG / LLM / AI Gateway 层，后者不要默认随模块一起重构。

---

## M04. AI Provider 配置

**前端**

- 路由：
  - `/ai-config`
- 主目录：
  - `frontend/src/features/ai-config/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/auth_routes/profile_ai_config.py`
- 服务：
  - `backend/services/user_profile_service.py`

**边界说明**

- 虽然功能上和 AI 有关，但它实际挂在 Profile 配置域，不在 `ai_routes`。

---

## M05. Knowledge Base / Course RAG 索引

**前端**

- 路由：
  - `/knowledge-base`
- 主目录：
  - `frontend/src/features/knowledge-base/**`
- 兼容 API 文件：
  - `frontend/src/api/knowledgeBaseApi.ts`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/ai_routes/index_course.py`
- 服务：
  - `backend/services/course_rag_service/service.py`
  - `backend/services/indexing_job_service.py`
  - `backend/services/indexing_job_extractors.py`
  - `backend/services/file_asset_service.py`
- 相关仓储：
  - `backend/repositories/indexing_job_repo.py`
  - `backend/repositories/document_repo.py`
  - `backend/repositories/file_asset_repo.py`
  - `backend/repositories/course_section_repo.py`

**边界说明**

- 负责课程文档上传、切块入库、索引任务管理、文档删除、知识库清单维护。
- 这里主要是“知识库管理/索引管理”边界，不含在线检索、重排、query rewrite 等 RAG 算法核心。

---

## M05B. RAG 算法核心

**前端**

- 没有独立前端页面。
- 主要被这些模块间接调用：
  - `frontend/src/features/ai-interact/**`
  - `frontend/src/features/knowledge-base/**`（检索测试）
  - `frontend/src/features/rag-evaluator/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由 / 编排入口：
  - `backend/routes/ai_routes/rag_orchestrator.py`
- 算法核心服务：
  - `backend/services/course_rag_service/retrieval_service.py`
  - `backend/services/course_rag_service/query_handler.py`
  - `backend/services/course_rag_service/retrieval_helpers.py`
  - `backend/services/course_rag_service/reranker.py`
  - `backend/services/course_rag_service/query_transforms.py`
  - `backend/services/course_rag_service/chunking.py`
  - `backend/services/rag_service/rag_chat_pipeline.py`
- 相关补充实现：
  - `backend/services/rag_service/tfidf_rag_service.py`
  - `backend/services/rag_service/vector_rag_service.py`

**边界说明**

- 这里是 RAG 在线算法层，负责 hybrid retrieval、BM25、multi-query、HyDE、self-query、rerank、chunk expansion、evidence packing。
- `M05` 负责“知识库/索引对象的生产与管理”。
- `M05B` 负责“查询时如何召回、重排、组装证据”。
- `M06` 负责“评测这些算法效果”，不是在线检索主链路。

---

## M06. RAG Evaluator

**前端**

- 路由：
  - `/admin/rag-evaluator`
- 主目录：
  - `frontend/src/features/rag-evaluator/**`
- 相关嵌入式管理面板：
  - `frontend/src/features/admin/components/rag-eval/**`
  - `frontend/src/features/admin/components/RAGEvalPanel.tsx`
- 兼容 API 文件：
  - `frontend/src/api/ragEvalApi.ts`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/admin_routes/rag_eval.py`
  - `backend/routes/admin_routes/telemetry.py`（RAG Telemetry 相关接口）
- 服务：
  - `backend/services/rag_service/rag_eval_service.py`
  - `backend/services/rag_service/rag_eval_wizard_service.py`
  - `backend/services/rag_service/rag_eval_scoring.py`
  - `backend/services/course_rag_service/**`
- 相关数据：
  - `evaluator/**`
  - `data/rag_eval/**`

**边界说明**

- 这是独立优化模块，不建议跟 Admin Dashboard 一起混改。

---

## M07. Admin Core（用户 / 课程 / 数据库 / API Keys / Staff Code / Telemetry）

**前端**

- 路由：
  - `/admin/dashboard`
  - `/admin/db-console`
- 主目录：
  - `frontend/src/features/admin/**`
- 注意：
  - 其中 `components/rag-eval/**` 更适合归到 `M06`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/admin_routes/router.py`
  - `backend/routes/admin_routes/users.py`
  - `backend/routes/admin_routes/courses.py`
  - `backend/routes/admin_routes/courses_v2.py`
  - `backend/routes/admin_routes/db_console.py`
  - `backend/routes/admin_routes/api_keys.py`
  - `backend/routes/admin_routes/staff_codes.py`
  - `backend/routes/admin_routes/telemetry.py`
- 服务：
  - `backend/services/admin_user_service.py`
  - `backend/services/admin_staff_code_service.py`
  - `backend/services/admin_query_service.py`
  - `backend/services/grading_service/**`（课程/作业旧新模型兼容）
- 相关仓储：
  - `backend/repositories/user_repo.py`
  - `backend/repositories/staff_code_repo.py`
  - `backend/repositories/course_section_repo.py`
  - `backend/repositories/enrollment_repo.py`
  - `backend/repositories/assignment_repo.py`

**边界说明**

- Admin Core 里混有“旧课程模型”和“v2 平铺模型”管理逻辑，优化时最好先限定范围。

---

## M08. User File Center（工具历史中心）

**前端**

- 路由：
  - `/file-center`
- 主目录：
  - `frontend/src/features/file-center/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/file_center_routes/router.py`
  - `backend/routes/file_center_routes/history_center.py`
- 服务：
  - `backend/services/history_service.py`
- 相关仓储：
  - `backend/repositories/history_repo.py`

**边界说明**

- 这里只是“历史聚合视图”。
- 真正的数据来源分散在 Slides / Questions / Study Notes / Diagram / Image Extractor / Video 等模块。

---

## M09. Admin File Center（文件资产治理）

**前端**

- 路由：
  - `/admin/file-center`
- 主目录：
  - `frontend/src/features/admin-file-center/**`
- 兼容 API 文件：
  - `frontend/src/api/fileCenterApi.ts`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/admin_routes/file_center.py`
  - `backend/routes/admin_routes/file_assets.py`
- 服务：
  - `backend/services/file_center_service.py`
  - `backend/services/file_asset_service.py`
  - `backend/services/file_assets/**`
- 相关仓储：
  - `backend/repositories/file_asset_repo.py`
  - `backend/repositories/ai_session_repo.py`

**边界说明**

- 这个模块的核心是“资产治理”，不是“历史记录浏览”。
- 它和 `M08` 有关联，但不应该当作同一个优化单元。

---

## M10. Chat / 即时通信

**前端**

- 路由：
  - `/chat`
  - `/chat/room/:roomId`
- 主目录：
  - `frontend/src/features/chat/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/chat_routes/router.py`
  - `backend/routes/chat_routes/contacts.py`
  - `backend/routes/chat_routes/rooms.py`
  - `backend/routes/chat_routes/messages.py`
  - `backend/routes/chat_routes/ai_actions.py`
  - `backend/routes/chat_routes/ws.py`
- 服务：
  - `backend/services/chat_service/contact_service.py`
  - `backend/services/chat_service/room_service.py`
  - `backend/services/chat_service/message_service.py`
  - `backend/services/chat_service/query_service.py`
  - `backend/services/chat_service/transfer_dispatch_service.py`
  - `backend/services/llm_service/chat_ai_service.py`
  - `backend/services/file_asset_service.py`

**边界说明**

- 聊天上传、转发、AI Summary/Rewrite/Assistant 都在这里。
- 其他模块通过 `transferApi` 把内容转进 Chat，但这些业务本身不属于 Chat 核心。

---

## M11. Diagram 生成器

**前端**

- 路由：
  - `/diagram`
- 主目录：
  - `frontend/src/features/diagram/**`

**后端**

- 挂载应用：
  - `backend/apps/visual.py`
- 路由：
  - `backend/routes/diagram_routes/router.py`
  - `backend/routes/diagram_routes/extraction.py`
  - `backend/routes/diagram_routes/generation.py`
  - `backend/routes/diagram_routes/history.py`
  - `backend/routes/diagram_routes/search_download.py`
- 服务：
  - `backend/services/diagram_service.py`
  - `backend/services/diagram_extractor_service.py`
  - `backend/services/history_service.py`
  - `backend/services/ai_gateway_service/**`

**边界说明**

- 功能包括：文档抽图、SVG 搜索、AI 生成、下载、历史记录。

---

## M12. Image Extractor

**前端**

- 路由：
  - `/image-extractor`（当前路由未直接挂到主导航，但前端 feature 独立存在）
- 主目录：
  - `frontend/src/features/image-extractor/**`

**后端**

- 挂载应用：
  - `backend/apps/visual.py`
- 路由：
  - `backend/routes/image_extractor_routes/router.py`
  - `backend/routes/image_extractor_routes/extraction.py`
  - `backend/routes/image_extractor_routes/search_generate.py`
  - `backend/routes/image_extractor_routes/export.py`
  - `backend/routes/image_extractor_routes/history.py`
- 服务：
  - `backend/services/image_extractor_service.py`
  - `backend/services/history_service.py`

**边界说明**

- 和 Diagram 共用 `visual.py`，但建议仍然作为独立模块优化。

---

## M13. Question Bank / Question Generator（Sub2）

**前端**

- 路由：
  - `/questions`
- 主目录：
  - `frontend/src/features/question-bank/**`
- 兼容 API 文件：
  - `frontend/src/api/questionBankApi.ts`

**后端**

- 挂载应用：
  - `backend/apps/questions.py`
- 路由：
  - `backend/routes/questions_routes/router.py`
  - `backend/routes/questions_routes/generate.py`
  - `backend/routes/questions_routes/tools.py`
  - `backend/routes/questions_routes/history.py`
  - `backend/routes/questions_routes/question_ops.py`
  - `backend/routes/questions_routes/validators.py`
- 服务：
  - `backend/services/questions_service.py`
  - `backend/services/questions/**`
  - `backend/services/question_ops_service.py`
  - `backend/services/history_service.py`
  - `backend/services/ai_gateway_service/**`
- 相关仓储：
  - `backend/repositories/question_ops_repo.py`
  - `backend/repositories/history_repo.py`
- Schema：
  - `backend/schemas/questions.py`

**边界说明**

- 这是一个非常适合单独交给 Codex 的模块。
- 可再细分为：上传/抽题、生成、约束建议、导出、历史回放、Question Ops。

---

## M14. Study Notes / Flashcards / Study Plan（Sub5）

**前端**

- 路由：
  - `/study-notes`
- 主目录：
  - `frontend/src/features/study-notes/**`

**后端**

- 挂载应用：
  - `backend/apps/study_notes.py`
- 路由：
  - `backend/routes/study_notes_routes/router.py`
  - `backend/routes/study_notes_routes/notes.py`
  - `backend/routes/study_notes_routes/study_plan.py`
  - `backend/routes/study_notes_routes/history.py`
  - `backend/routes/study_notes_routes/room_notes.py`
  - `backend/routes/study_notes_routes/helpers.py`
- 服务：
  - `backend/services/study_plan_service.py`
  - `backend/services/study_room_note_service.py`
  - `backend/services/history_service.py`
  - `backend/services/ai_gateway_service/**`
- 相关仓储：
  - `backend/repositories/study_plan_repo.py`
  - `backend/repositories/study_room_note_repo.py`
  - `backend/repositories/history_repo.py`

**边界说明**

- 知识点总结、闪卡、复习计划、复习反馈都在这里。
- `room_notes.py` 同时被 Student Study Room 复用。

---

## M15. Student Study Room（学生学习空间）

**前端**

- 路由：
  - `/home_student`
- 主目录：
  - `frontend/src/features/study-room/**`

**后端**

- 这是一个组合模块，没有单独后端目录。
- 对应后端来源：
  - 学生课程/作业/提交：
    - `backend/routes/auth_routes/student_v2.py`
    - `backend/services/student_assignment_service.py`
  - 学习对话流：
    - `backend/routes/ai_routes/study_stream.py`
    - `backend/routes/ai_routes/study_coach.py`
  - 学习房间笔记：
    - `backend/routes/study_notes_routes/room_notes.py`
    - `backend/services/study_room_note_service.py`

**边界说明**

- 这是典型的“前端单模块，后端多模块拼装”页面。
- 让 Codex 优化它时，要明确告诉它能否改 Auth / AI / Study Notes 三个后端域。

---

## M16. Teacher Mailbox（教师收件箱 / 提交列表）

**前端**

- 路由：
  - `/mailbox`
- 主目录：
  - `frontend/src/features/mailbox/**`
- 兼容 API 文件：
  - `frontend/src/api/mailboxApi.ts`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/mailbox_routes/router.py`
  - `backend/routes/grading_routes/router.py`（部分列表页会复用课程接口）
- 服务：
  - `backend/services/mailbox_service.py`
  - `backend/services/grading_service/**`

**边界说明**

- Mailbox 负责课程 -> 作业 -> 提交 的筛选和列表流。
- 真正的批注与打分工作台属于 `M17`，不要混成一个模块。

---

## M17. Grading Workbench（批注与评分工作台）

**前端**

- 路由：
  - `/mailbox/grade_workbench/:submissionId`
- 主目录：
  - `frontend/src/features/grading/**`

**后端**

- 挂载应用：
  - `backend/apps/core.py`
- 路由：
  - `backend/routes/grading_routes/router.py`
  - `backend/routes/ai_gateway_routes/router.py`
  - `backend/routes/ai_gateway_routes/grading.py`
  - `backend/routes/ai_gateway_routes/feedback.py`
  - `backend/routes/ai_gateway_routes/grading_context_helpers.py`
- 服务：
  - `backend/services/grading_service/**`
  - `backend/services/ai_gateway_service/grading.py`
  - `backend/services/rag_service/tfidf_rag_service.py`
- Schema：
  - `backend/schemas/grading.py`

**边界说明**

- 这是“评分执行层”，不是“提交列表层”。
- 涉及 PDF 批注、总分、题目重判、评分辅助问答。

---

## M18. Homework 发布

**前端**

- 路由：
  - `/publish-homework`
- 主目录：
  - `frontend/src/features/homework/**`

**后端**

- 挂载方式：
  - `backend/apps/core.py` 通过 direct router 挂载
- 路由：
  - `backend/routes/homework_routes/router.py`
- 服务：
  - `backend/services/homework_service.py`
- 相关仓储：
  - `backend/repositories/homework_repo.py`
  - `backend/repositories/assignment_repo.py`
  - `backend/repositories/submission_repo.py`

**边界说明**

- 教师发布作业在这里。
- 学生提交作业不在这里，而在 `M01` 的 `student_v2.py`。

---

## M19A. Slides - Markdown Processor / Parse（Sub1 解析链路）

**前端**

- 路由：
  - `/slides/md-processor`
- 主目录：
  - `frontend/src/features/slides/pages/MdProcessor/**`
- 模块公共文件：
  - `frontend/src/features/slides/api/slidesApi.ts`
  - `frontend/src/features/slides/types.ts`

**后端**

- 挂载应用：
  - `backend/apps/slides.py`
- 路由：
  - `backend/routes/slides_routes/parse.py`
  - `backend/routes/slides_routes/history.py`
  - `backend/routes/slides_routes/artifacts.py`
  - `backend/routes/slides_routes/generation.py`（部分 outline / text 处理接口）
- 服务：
  - `backend/services/slides_pipeline_service.py`
  - `backend/services/slides/parsing/**`
  - `backend/services/history_service.py`

**边界说明**

- 负责：上传文档、解析 MD、合并内容、从文本生成提纲。

---

## M19B. Slides - Highlighter

**前端**

- 路由：
  - `/slides/highlighter`
- 主目录：
  - `frontend/src/features/slides/pages/Highlighter/**`

**后端**

- 挂载应用：
  - `backend/apps/highlighter.py`
- 路由：
  - `backend/routes/slides_routes/highlights.py`
  - `backend/routes/slides_routes/artifacts.py`（下载合并文本）
- 服务：
  - `backend/services/slides_pipeline_service.py`

**边界说明**

- 这是 Slides 体系里的独立子模块，入口和部署都与主 Slides app 分开。

---

## M19C. Slides - Specify / Quick Process / AI Theme Config

**前端**

- 路由：
  - `/slides/specify`
  - `/slides/quick-process`
  - `/slides/ai-theme-config`
- 主目录：
  - `frontend/src/features/slides/pages/Specify/**`
  - `frontend/src/features/slides/pages/QuickProcess/**`
  - `frontend/src/features/slides/pages/AIThemeConfig/**`

**后端**

- 挂载应用：
  - `backend/apps/slides.py`
- 路由：
  - `backend/routes/slides_routes/generation.py`
  - `backend/routes/slides_routes/history.py`
  - `backend/routes/slides_routes/artifacts.py`
  - `backend/routes/slides_routes/template.py`
- 服务：
  - `backend/services/slides_pipeline_service.py`
  - `backend/services/slides/generation/**`
  - `backend/services/slides/dynamic_theme_service.py`
  - `backend/services/slides/output/**`

**边界说明**

- 这部分更偏“内容生成与主题渲染”。
- 如果只优化模板编辑器，不要默认改这一组。

---

## M19D. Slides - PPT Template / Editor / Delivery

**前端**

- 路由：
  - `/slides/ppt-template`
  - `/slides/editor/:sessionId`
- 主目录：
  - `frontend/src/features/slides/pages/PptTemplate/**`
  - `frontend/src/features/slides/pages/Editor/**`
- 模块公共文件：
  - `frontend/src/features/slides/api/slidesApi.ts`
  - `frontend/src/features/slides/components/SlidesLoadingState.tsx`

**后端**

- 挂载应用：
  - `backend/apps/slides.py`
- 路由：
  - `backend/routes/slides_routes/delivery.py`
  - `backend/routes/slides_routes/editor.py`
  - `backend/routes/slides_routes/template.py`
  - `backend/routes/slides_routes/layout_preview.py`
  - `backend/routes/slides_routes/template_mapping.py`
  - `backend/routes/slides_routes/observability.py`
  - `backend/routes/slides_routes/artifacts.py`
- 服务：
  - `backend/services/slides_delivery_service.py`
  - `backend/services/background_job_dispatcher.py`
  - `backend/services/background_job_runtime.py`
  - `backend/services/slides/output/**`
  - `backend/services/slides/output/editor_session/**`
  - `backend/services/slides/presenton/**`
  - `backend/services/slides/infra/**`
- 相关仓储：
  - `backend/repositories/slides_delivery_job_repo.py`
  - `backend/repositories/background_job_repo.py`

**边界说明**

- 这是 Slides 中最值得单独切出来优化的一大块。
- 包含：模板占位符、布局映射、编辑器 session、交付包、导出。

---

## M20. Video Generation

**前端**

- 路由：
  - `/video-gen`
  - `/slide-renderer`（内部渲染辅助页面）
- 主目录：
  - `frontend/src/features/video-gen/**`

**后端**

- 挂载应用：
  - `backend/apps/video.py`
- 路由：
  - `backend/routes/video_routes/router.py`
  - `backend/routes/video_routes/uploads.py`
  - `backend/routes/video_routes/generation.py`
  - `backend/routes/video_routes/scripts.py`
  - `backend/routes/video_routes/progress.py`
  - `backend/routes/video_routes/history.py`
- 服务：
  - `backend/services/video_service/**`
  - `backend/services/history_service.py`

**边界说明**

- 这是一个完整独立子系统：文本抽取、脚本优化、场景生成、视频渲染、章节与 Quiz 生成都在这里。
- `SlideRendererPage.tsx` 是后端渲染流程依赖的前端辅助页，也应视作 Video 子系统一部分。

---

## 4. 共享层（默认不要跟单模块一起改）

### 前端共享层

- `frontend/src/shared/**`
- `frontend/src/router/**`
- `frontend/src/types/**`
- `frontend/src/styles/**`
- `frontend/src/api/historyApiFactory.ts`
- `frontend/src/shared/api/client.ts`
- `frontend/src/shared/api/root.ts`

### 后端共享层

- 应用装配：
  - `backend/main.py`
  - `backend/apps/factory.py`
  - `backend/apps/core.py`
- 基础设施：
  - `backend/core/**`
  - `backend/config.py`
  - `backend/middleware/**`
  - `backend/exceptions/**`
  - `backend/infrastructure/**`
- AI 共享层：
  - `backend/services/ai_gateway_service/**`
  - `backend/services/llm_service/**`
  - `backend/services/course_rag_service/**`
  - `backend/services/rag_service/**`
- 文件与历史共享层：
  - `backend/services/file_asset_service.py`
  - `backend/services/file_assets/**`
  - `backend/services/history_service.py`
- 数据访问层：
  - `backend/repositories/**`
- 通用 Schema：
  - `backend/schemas/**`

## 5. 建议给 Codex 的调用方式

建议以后按下面这种方式提需求：

```md
请只优化 M13 Question Bank 模块。

允许修改：
- frontend/src/features/question-bank/**
- frontend/src/api/questionBankApi.ts
- backend/apps/questions.py
- backend/routes/questions_routes/**
- backend/services/questions/**
- backend/services/questions_service.py
- backend/services/question_ops_service.py
- backend/repositories/question_ops_repo.py
- backend/schemas/questions.py

默认不要修改：
- frontend/src/shared/**
- backend/core/**
- backend/services/ai_gateway_service/**
- backend/services/history_service.py
```

如果要做跨模块优化，建议直接在需求里同时写出模块 ID，例如：

- `M15 + M14`：Student Study Room + Study Notes
- `M16 + M17`：Mailbox + Grading Workbench
- `M05 + M05B + M03 + M06`：Knowledge Base + RAG Core + AI Interaction + RAG Evaluator

## 6. 一句话总结

这个仓库最适合按下面这组粒度交给 Codex 分治优化：

- `M01` Auth/Profile
- `M03` AI Interaction
- `M05` Knowledge Base
- `M05B` RAG Core
- `M06` RAG Evaluator
- `M07` Admin Core
- `M08` User File Center
- `M09` Admin File Center
- `M10` Chat
- `M11` Diagram
- `M12` Image Extractor
- `M13` Question Bank
- `M14` Study Notes
- `M15` Student Study Room
- `M16` Teacher Mailbox
- `M17` Grading Workbench
- `M18` Homework
- `M19A~M19D` Slides 四个子模块
- `M20` Video Generation
