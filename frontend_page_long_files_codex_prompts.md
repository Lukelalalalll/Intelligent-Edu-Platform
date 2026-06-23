# frontend 非 slides/presenton 页面超长文件清单

## 说明

- 范围：只看 `frontend/src/features` 下实际挂在路由里的页面。
- 排除：`frontend/src/features/slides`、`frontend/src/presenton`、以及 presenton 相关页面链路。
- 页面来源：以 [frontend/src/router/routes.ts](/D:/Desktop/Intelligent-Edu-Platform/frontend/src/router/routes.ts:15) 为准。
- “超长文件”口径：`ts/tsx` 文件大于等于 200 行。
- 用途：帮你快速定位每个页面最值得先拆的文件，并给出可直接发给 Codex 的 prompt。

## 按页面汇总

| 页面路由 | 页面入口 | 对应超长文件 |
| --- | --- | --- |
| `/` | `frontend/src/features/home/pages/HomePage.tsx` | `components/AIChatBox/components/MessageList.tsx` (208), `hooks/AIChatBox/useAIChatBox.ts` (202) |
| `/login` | `frontend/src/features/auth/pages/LoginPage.tsx` | `pages/LoginPage.tsx` (318), `components/GoogleAuthSection.tsx` (409) |
| `/register` | `frontend/src/features/auth/pages/RegisterPage.tsx` | `components/GoogleAuthSection.tsx` (409) |
| `/forgot-password` | `frontend/src/features/auth/pages/ForgotPage.tsx` | 暂无 >= 200 行文件 |
| `/profile` | `frontend/src/features/auth/pages/ProfilePage.tsx` | `pages/ProfilePage.tsx` (661), `components/GoogleAuthSection.tsx` (409) |
| `/home_student` | `frontend/src/features/study-room/pages/HomeStudentPage.tsx` | `components/PdfViewer.tsx` (332), `components/StudyCoach.tsx` (289), `components/AssignmentsTab.tsx` (231) |
| `/admin/dashboard` | `frontend/src/features/admin/pages/AdminDashboardPage.tsx` | `pages/AdminDashboardPage.tsx` (219), `components/FileCenterPanel.tsx` (258), `components/ApiKeyPanel.tsx` (241) |
| `/admin/security` | `frontend/src/features/admin/pages/AdminSecurityPage.tsx` | `pages/AdminSecurityPage.tsx` (389) |
| `/admin/db-console` | `frontend/src/features/admin/pages/AdminDbConsolePage.tsx` | `pages/AdminDbConsole.tsx` (270) |
| `/admin/file-center` | `frontend/src/features/admin-file-center/pages/AdminFileCenterPage.tsx` | `index.tsx` (377) |
| `/admin/rag-evaluator` | `frontend/src/features/rag-evaluator/pages/RagEvaluatorPage.tsx` | `components/StepDataset.tsx` (312), `components/StepConfig.tsx` (258), `pages/RagEvaluatorPage.tsx` (239), `components/StepResults.tsx` (225) |
| `/ai-interaction` | `frontend/src/features/ai-interact/pages/AIInteractPage.tsx` | `hooks/useAISessions/useAISessionManager.ts` (424) |
| `/ai-config` | `frontend/src/features/ai-config/pages/AIConfigPage.tsx` | `components/ProviderConfigCards.tsx` (315), `pages/AIConfigPage.tsx` (219) |
| `/chat`、`/chat/room/:roomId` | `frontend/src/features/chat/pages/ChatPage.tsx` | `components/MessageBubble.tsx` (380), `components/GroupInfoPanel.tsx` (346), `hooks/useChatRoom.ts` (264), `components/MessageInput.tsx` (255), `components/ChatWindow.tsx` (251), `components/TransferModal.tsx` (209) |
| `/diagram` | `frontend/src/features/diagram/pages/DiagramPage.tsx` | `components/HistoryPanel.tsx` (336), `components/ImageExtractSection.tsx` (273), `hooks/useDiagramExtractSearch.ts` (270), `utils/beautifySvg.ts` (220) |
| `/questions` | `frontend/src/features/question-bank/pages/QuestionGeneratorPage.tsx` | 暂无 >= 200 行文件 |
| `/study-notes` | `frontend/src/features/study-notes/pages/StudyNotesPage.tsx` | `pages/StudyNotesPage.tsx` (273) |
| `/knowledge-base` | `frontend/src/features/knowledge-base/pages/KnowledgeBasePage.tsx` | `hooks/useKnowledgeBase.ts` (239), `components/document-manager/TestRetrievalPanel.tsx` (210), `components/DocumentManager.tsx` (201) |
| `/video-gen` | `frontend/src/features/video-gen/pages/VideoGenPage.tsx` | `components/StepUpload.tsx` (267), `components/VideoPlayerWithChapters.tsx` (237), `components/SceneCard.tsx` (222) |
| `/file-center` | `frontend/src/features/file-center/pages/FileCenterPage.tsx` | `components/ToolHistoryTab.tsx` (276), `components/HistoryDetailModal.tsx` (213) |
| `/mailbox` | `frontend/src/features/mailbox/pages/MailboxPage.tsx` | 暂无 >= 200 行文件 |
| `/mailbox/grade_workbench/:submissionId` | `frontend/src/features/grading/pages/GradingWorkbenchPage.tsx` | `pages/GradingWorkbenchPage.tsx` (425), `hooks/useCozeAssistant.ts` (283), `components/PDFViewer.tsx` (208) |
| `/publish-homework` | `frontend/src/features/homework/pages/PublishHomeworkPage.tsx` | 暂无 >= 200 行文件 |

## 优先级建议

如果你想先抓最值得拆的页面，我建议优先看这些：

1. `/chat`：超长文件最密集。
2. `/profile`：单页 661 行，已经很重。
3. `/diagram`：页面壳不长，但核心 hook 和功能区都很重。
4. `/mailbox/grade_workbench/:submissionId`：主页面、AI hook、PDF 预览都偏重。
5. `/admin/rag-evaluator`：标准的多步骤工作台，组件继续长下去会很难改。

## 可直接发给 Codex 的 prompt

下面每段都可以单独复制给 Codex。

### 首页 `/`

#### `frontend/src/features/home/components/AIChatBox/components/MessageList.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/home/components/AIChatBox/components/MessageList.tsx。

背景：
- 这个文件属于首页 `/` 的 AI 聊天区。
- 文件约 208 行，已经偏长。
- 它大概率同时承担了消息列表遍历、不同消息类型渲染、空态/加载态、滚动锚点等职责。

请先做这些事：
1. 用 CodeGraph 梳理它的调用方、props、依赖样式、下游子组件。
2. 总结它当前承担的职责，以及最适合拆出去的 UI 区块和纯渲染逻辑。

然后完成下面工作：
1. 在不改变现有视觉和交互的前提下做重构。
2. 优先考虑拆分：消息项、空态/加载态、滚动辅助逻辑、纯展示 helpers。
3. 如果存在明显的重渲染风险，做低风险优化，但不要过度抽象。
4. 给出最关键的回归测试点。

输出要求：
- 改动摘要
- 拆分后的文件结构
- 行为保持说明
- 剩余技术债

约束：
- 不要动 slides/presenton 相关目录。
- 遵循现有 React + CSS module + shared components 模式。
```

#### `frontend/src/features/home/hooks/AIChatBox/useAIChatBox.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/home/hooks/AIChatBox/useAIChatBox.ts。

背景：
- 这个文件属于首页 `/` 的 AI 聊天区核心 hook。
- 文件约 202 行。
- 它可能把输入状态、消息流、请求生命周期、错误处理、滚动副作用混在了一起。

请先用 CodeGraph 梳理：
1. 这个 hook 的对外接口。
2. 它内部维护的状态。
3. 网络调用和流式处理逻辑。
4. 哪些组件在消费它。

然后完成：
1. 判断它是否存在“状态机 + 请求编排 + UI 副作用”耦合过重的问题。
2. 在不改变 hook 对外返回值和页面行为的前提下，拆分内部职责。
3. 优先抽出：stream 处理、错误归一化、初始化逻辑、纯 helpers。
4. 给出最值得补的 hook 级测试建议。

输出要求：
- 现状问题
- 重构策略
- 具体修改
- 风险点
- 测试建议
```

### 认证页 `/login` `/register` `/profile`

#### `frontend/src/features/auth/pages/LoginPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/auth/pages/LoginPage.tsx。

背景：
- 这个文件对应 `/login` 页面。
- 文件约 318 行。
- 它很可能同时承载普通登录、表单校验、跳转逻辑、错误提示和第三方登录入口。

请先用 CodeGraph 看清楚：
1. 它依赖的 auth store。
2. 国际化依赖。
3. 表单结构。
4. Google 登录区的接入方式。

然后完成：
1. 列出当前页面的职责边界。
2. 指出哪些逻辑应留在页面容器，哪些应抽到表单区、动作区或 hooks。
3. 做一次最小风险重构，优先分离表单视图、提交逻辑、错误展示、跳转副作用。
4. 保持现有文案、交互和样式结构不变。
5. 给出关键回归测试点。

输出要求：
- 拆分前问题
- 拆分方案
- 代码改动摘要
- 回归风险
```

#### `frontend/src/features/auth/components/GoogleAuthSection.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/auth/components/GoogleAuthSection.tsx。

背景：
- 这个文件被 `/login`、`/register`、`/profile` 复用。
- 文件约 409 行。
- 它可能把 Google 登录按钮、绑定状态、回调处理、错误提示和页面分支逻辑都塞在了一起。

请先用 CodeGraph 梳理：
1. 调用方和 props 差异。
2. 外部依赖。
3. 事件流。

然后完成：
1. 区分哪些逻辑是跨页面共享能力，哪些是页面特定分支。
2. 在不改变外部 API 的前提下重构。
3. 优先拆出：展示层、状态判定 helpers、回调处理逻辑、错误与 loading 展示。
4. 重点关注登录、绑定、解绑、异常回退这几条链路的回归风险。

输出要求：
- 共享职责划分
- 改动摘要
- 受影响页面
- 风险与测试建议
```

#### `frontend/src/features/auth/pages/ProfilePage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/auth/pages/ProfilePage.tsx。

背景：
- 这个文件对应 `/profile` 页面。
- 文件约 661 行，是认证线里最重的页面之一。
- 它可能混合了用户信息展示、编辑、第三方账号绑定、密码或安全操作、多段表单状态。

请先用 CodeGraph 理解：
1. 状态来源。
2. 页面区块。
3. 副作用。
4. 与共享认证组件的关系。

然后完成：
1. 给出页面职责分层图。
2. 明确哪些区块适合拆成独立 section 组件或 hooks。
3. 在不改变页面交互和现有 store/API 契约的前提下重构。
4. 优先拆分资料区、安全区、第三方绑定区、提交动作区。
5. 把复杂条件和派生值提炼成 helpers。

输出要求：
- 页面结构分析
- 重构方案
- 具体改动
- 未处理技术债
```

### 学生空间 `/home_student`

#### `frontend/src/features/study-room/components/PdfViewer.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/study-room/components/PdfViewer.tsx。

背景：
- 这个文件属于 `/home_student` 页面。
- 文件约 332 行。
- 它可能同时处理文档加载、分页、缩放、高亮或联动。

请先用 CodeGraph 梳理 props、外部依赖、与学习空间其他面板的联动，然后：
1. 判断渲染逻辑、交互控制、数据适配是否耦合过深。
2. 在不改变阅读体验的前提下重构。
3. 优先拆出工具栏、分页/缩放控制、文档状态处理、纯渲染 helpers。
4. 给出性能和回归测试建议。
```

#### `frontend/src/features/study-room/components/StudyCoach.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/study-room/components/StudyCoach.tsx。

背景：
- 这个文件属于 `/home_student` 页面。
- 文件约 289 行。
- 它可能混合了输入、会话、推荐、提示和结果展示。

请先用 CodeGraph 看清楚数据流和外部依赖，然后：
1. 标出最适合拆开的状态逻辑和 UI 区块。
2. 用最小风险方式重构。
3. 优先考虑输入区、消息区、操作区、推荐区拆分。
4. 保持现有交互和文案不变。
5. 给出异步响应、空态、报错路径的测试建议。
```

#### `frontend/src/features/study-room/components/AssignmentsTab.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/study-room/components/AssignmentsTab.tsx。

背景：
- 这个文件属于 `/home_student` 页面。
- 文件约 231 行。
- 它可能承担了作业列表、筛选、详情展开和动作按钮。

请先用 CodeGraph 理解它和学习空间其他模块的关系，然后：
1. 盘点列表展示、筛选/状态、详情展开、动作按钮等职责。
2. 在不改现有行为的前提下，拆出列表项、过滤逻辑、空态/加载态。
3. 如果存在重复 JSX 或复杂条件渲染，做可读性优化。
4. 给出关键回归点。
```

### 管理后台 `/admin/*`

#### `frontend/src/features/admin/pages/AdminDashboardPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin/pages/AdminDashboardPage.tsx。

背景：
- 这个文件对应 `/admin/dashboard`。
- 文件约 219 行。
- 它是后台总览页，容易继续膨胀成大容器。

请先用 CodeGraph 查看它拼装了哪些后台面板和数据源，然后：
1. 判断它是否承担了过多布局、状态和数据装配职责。
2. 在保持功能不变的前提下整理布局壳、数据装配和区块配置。
3. 如果适合，把面板配置常量、派生数据和页面动作拆开。
4. 给出未来继续扩展时最该提前处理的结构问题。
```

#### `frontend/src/features/admin/components/FileCenterPanel.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin/components/FileCenterPanel.tsx。

背景：
- 这个文件服务于 `/admin/dashboard`。
- 文件约 258 行。
- 它可能混合了列表、筛选、统计和管理动作。

请先用 CodeGraph 理解 props、数据来源和操作事件，然后：
1. 识别最适合抽离的表格区、工具栏区和状态辅助逻辑。
2. 在不改变后台操作路径的前提下做最小风险重构。
3. 如果存在重复的单元格渲染或条件判断，抽成小组件或 helpers。
4. 标出最关键的回归点。
```

#### `frontend/src/features/admin/components/ApiKeyPanel.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin/components/ApiKeyPanel.tsx。

背景：
- 这个文件服务于 `/admin/dashboard`。
- 文件约 241 行。
- 它通常会混合列表、创建/编辑、敏感信息展示和权限动作。

请先用 CodeGraph 了解它的状态流和依赖，然后：
1. 梳理表单区、列表区、弹窗/确认动作、敏感数据显示这几类职责。
2. 做最小风险重构，降低主组件里的条件分支和事件处理密度。
3. 关注安全相关 UX 不能回退，比如掩码、复制、删除确认。
4. 给出最值得补的测试点。
```

#### `frontend/src/features/admin/pages/AdminSecurityPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin/pages/AdminSecurityPage.tsx。

背景：
- 这个文件对应 `/admin/security`。
- 文件约 389 行。
- 它是单页复杂度很高的后台页面。

请先用 CodeGraph 梳理页面区块和副作用，然后：
1. 给出页面结构图，区分容器职责和各个安全 section 职责。
2. 在不改变权限逻辑和交互的前提下，把冗长 JSX、条件分支和提交逻辑拆开。
3. 优先抽离表单 section、提交动作、状态归一化 helpers。
4. 标出高风险回归点，比如保存、回滚、错误展示、权限控制。
```

#### `frontend/src/features/admin/pages/AdminDbConsole.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin/pages/AdminDbConsole.tsx。

背景：
- 这个文件对应 `/admin/db-console` 的主体实现。
- 文件约 270 行。
- 它可能把输入、执行、结果展示和错误处理堆在一起。

请先用 CodeGraph 理解执行流程和依赖，然后：
1. 判断哪些逻辑是编辑器/输入区，哪些是请求执行，哪些是结果展示。
2. 在不改变控制台行为的前提下，拆成更清楚的区块或 helpers。
3. 如果有明显的危险分支、重复状态或副作用散落，顺手整理。
4. 说明执行、取消、错误态、结果渲染这些回归点。
```

#### `frontend/src/features/admin-file-center/index.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/admin-file-center/index.tsx。

背景：
- 这个文件实际承载 `/admin/file-center` 的主要业务实现。
- 文件约 377 行。
- page 文件只是薄壳，这里才是真正的大入口。

请先用 CodeGraph 梳理它装配了哪些 section、API 和局部状态，然后：
1. 给出页面级职责拆分图。
2. 区分总容器、筛选/导航、表格区和详情动作。
3. 在保持功能和样式不变的前提下，把过重的装配逻辑拆成更清晰的 section 组件或页面 hooks。
4. 把重复的列定义、映射逻辑或派生状态提炼出来。
5. 标出最需要补的回归点。
```

### RAG / AI 交互 / AI 配置

#### `frontend/src/features/rag-evaluator/components/StepDataset.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/rag-evaluator/components/StepDataset.tsx。

背景：
- 这个文件属于 `/admin/rag-evaluator` 的数据集步骤。
- 文件约 312 行。
- 它是典型的多步骤流程大组件。

请先用 CodeGraph 看清楚 props、父级 stepper 和 API 依赖，然后：
1. 识别这个 step 里哪些是表单配置，哪些是列表/上传展示，哪些是校验与动作。
2. 在不改变多步骤流程体验的前提下，拆分冗长 JSX 和事件处理。
3. 如果状态校验逻辑分散，请统一整理到 helpers 或小 hooks。
4. 说明最关键的回归点。
```

#### `frontend/src/features/rag-evaluator/components/StepConfig.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/rag-evaluator/components/StepConfig.tsx。

背景：
- 这个文件属于 `/admin/rag-evaluator` 的配置步骤。
- 文件约 258 行。
- 它容易堆积参数表单、默认值、校验和说明文案。

请先用 CodeGraph 理解字段来源和提交关系，然后：
1. 把字段渲染、参数归一化、表单交互和错误展示分层。
2. 用最小风险方式拆分表单区块或字段 helpers。
3. 保持当前配置项行为、默认值和保存逻辑不变。
4. 给出最需要补的测试建议。
```

#### `frontend/src/features/rag-evaluator/pages/RagEvaluatorPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/rag-evaluator/pages/RagEvaluatorPage.tsx。

背景：
- 这个文件对应 `/admin/rag-evaluator` 页面主体。
- 文件约 239 行。
- 它是一个分步工作台，容易把步骤 orchestration、状态同步和导航逻辑揉在一起。

请先用 CodeGraph 梳理它和各个 Step 组件的关系，然后：
1. 识别页面容器真正应该保留的职责。
2. 把可以下沉到 step、页面 hook 或配置常量的内容拆开。
3. 保持现有步骤切换、数据流和提交链路不变。
4. 说明最关键的回归点。
```

#### `frontend/src/features/rag-evaluator/components/StepResults.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/rag-evaluator/components/StepResults.tsx。

背景：
- 这个文件属于 `/admin/rag-evaluator` 的结果步骤。
- 文件约 225 行。
- 它可能承载结果汇总、表格/图表、导出或明细展示。

请先用 CodeGraph 了解输入数据和展示模式，然后：
1. 划分结果摘要、细项展示、空态/错误态、操作区这几类职责。
2. 在不改变结果展示结构的前提下，把复杂渲染块拆开。
3. 如果有大量格式化逻辑，抽成纯函数，便于测试。
4. 给出最应该覆盖的回归测试点。
```

#### `frontend/src/features/ai-interact/hooks/useAISessions/useAISessionManager.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/ai-interact/hooks/useAISessions/useAISessionManager.ts。

背景：
- 这个文件属于 `/ai-interaction`。
- 文件约 424 行。
- 它可能同时负责 session 列表、当前会话、消息流、创建/切换/删除和流式响应编排。

请先用 CodeGraph 梳理对外接口、内部状态、异步流程和消费方，然后：
1. 判断是否存在“会话状态机 + 网络编排 + UI 副作用”耦合过重的问题。
2. 在不改变对外 API 的前提下拆分内部结构。
3. 优先抽离 session CRUD、消息流处理、错误归一化、持久化或初始化逻辑。
4. 明确最关键的回归测试点，尤其是切会话、流式回复、异常中断和重试。
```

#### `frontend/src/features/ai-config/components/ProviderConfigCards.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/ai-config/components/ProviderConfigCards.tsx。

背景：
- 这个文件属于 `/ai-config` 页面。
- 文件约 315 行。
- 它可能是多个 AI provider 配置卡片的总装组件，条件分支和字段组合会很多。

请先用 CodeGraph 理解 props、provider 类型和字段渲染方式，然后：
1. 识别哪些逻辑是 provider 通用层，哪些是 provider 特定层。
2. 在不改变配置行为的前提下，把卡片结构、字段区、校验/说明和动作区拆清楚。
3. 如果有大量按 provider 分支的 JSX，请整理得更可维护。
4. 标出关键回归点。
```

#### `frontend/src/features/ai-config/pages/AIConfigPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/ai-config/pages/AIConfigPage.tsx。

背景：
- 这个文件对应 `/ai-config` 页面。
- 文件约 219 行。
- 它已经是偏重的页面容器。

请先用 CodeGraph 理解它如何组织 provider 配置区、数据加载和保存动作，然后：
1. 评估页面容器里哪些是装配职责，哪些是应该下沉的状态和事件。
2. 做一次小而稳的重构，让页面主体更聚焦于布局和 orchestration。
3. 保持现有交互、保存链路和样式不变。
4. 给出最该补的回归点。
```

### 聊天页 `/chat`

#### `frontend/src/features/chat/components/MessageBubble.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/components/MessageBubble.tsx。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 380 行。
- 它可能同时处理角色样式、富文本、附件、工具调用结果、状态标记和操作按钮。

请先用 CodeGraph 梳理 props 形状、调用方、样式和下游 helpers，然后：
1. 明确哪些渲染分支最复杂，哪些应该提炼成子组件或纯函数。
2. 在保持消息外观和交互不变的前提下，拆分消息头、正文、附件区、状态区和操作区。
3. 如果有明显的重复分支或重渲染风险，做低风险整理。
4. 补充或建议关键回归测试，重点覆盖不同消息类型。
```

#### `frontend/src/features/chat/components/GroupInfoPanel.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/components/GroupInfoPanel.tsx。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 346 行。
- 它通常会堆积群成员、设置、邀请、管理操作和条件展示。

请先用 CodeGraph 理解输入数据、管理动作和权限分支，然后：
1. 划分信息展示、成员管理、群设置和动作区职责。
2. 在不改变群聊使用路径的前提下，拆开过长 JSX 和事件处理。
3. 如果有权限相关条件分支，请整理得更可读，但保持行为不变。
4. 标出最关键的回归测试点。
```

#### `frontend/src/features/chat/hooks/useChatRoom.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/hooks/useChatRoom.ts。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 264 行。
- 它可能混合了房间切换、消息拉取、发送、订阅和滚动副作用。

请先用 CodeGraph 梳理 hook 的对外接口、内部状态和异步流程，然后：
1. 判断哪些职责应该拆成内部 helpers 或子 hooks。
2. 在不改变对外返回值和调用方式的前提下，重构状态流和副作用组织。
3. 保持聊天行为、请求顺序和错误处理一致。
4. 指出最关键的 hook 级回归点。
```

#### `frontend/src/features/chat/components/MessageInput.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/components/MessageInput.tsx。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 255 行。
- 它可能混合了文本输入、附件选择、快捷动作、发送态和键盘交互。

请先用 CodeGraph 理解 props、事件和外部依赖，然后：
1. 拆分输入控件、附件区、操作按钮、键盘行为和校验逻辑。
2. 在不改变输入体验的前提下，降低主组件复杂度。
3. 保持发送快捷键、禁用态、上传态等行为不变。
4. 给出关键回归测试建议。
```

#### `frontend/src/features/chat/components/ChatWindow.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/components/ChatWindow.tsx。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 251 行。
- 它通常负责消息区、输入区、滚动、空态和工具栏装配。

请先用 CodeGraph 梳理它和消息列表、输入区、房间 hook 的关系，然后：
1. 区分这个容器真正该保留的 orchestration 职责。
2. 把可以下沉的展示块、派生值和事件处理拆走。
3. 保持页面布局、滚动和交互路径不变。
4. 标出最关键的回归点。
```

#### `frontend/src/features/chat/components/TransferModal.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/chat/components/TransferModal.tsx。

背景：
- 这个文件属于 `/chat` 页面。
- 文件约 209 行。
- 它是转交/转存类弹窗，容易把状态、校验和列表展示混在一起。

请先用 CodeGraph 理解使用场景和数据流，然后：
1. 梳理弹窗展示、表单/选择、确认动作和异常处理。
2. 在不改变弹窗交互的前提下，拆出可复用的小块和纯函数。
3. 确保提交、取消、校验、loading、错误态行为保持一致。
4. 给出最关键的回归测试建议。
```

### 图像工具 `/diagram`

#### `frontend/src/features/diagram/components/HistoryPanel.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/diagram/components/HistoryPanel.tsx。

背景：
- 这个文件属于 `/diagram` 页面。
- 文件约 336 行。
- 它可能混合了历史列表、筛选、预览、回放和删除等动作。

请先用 CodeGraph 了解 props、历史 API 和回放链路，然后：
1. 划分列表区、筛选区、操作区、详情/预览区职责。
2. 在不改变历史面板行为的前提下，拆分冗长 JSX 和事件处理。
3. 如果有与父页面耦合过深的状态，请整理接口边界。
4. 标出回放、删除、空态和异常处理这些关键回归点。
```

#### `frontend/src/features/diagram/components/ImageExtractSection.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/diagram/components/ImageExtractSection.tsx。

背景：
- 这个文件属于 `/diagram` 页面。
- 文件约 273 行。
- 它可能把上传、抽取结果、章节组织、预览和下载操作揉在一起。

请先用 CodeGraph 梳理 props、依赖状态和动作，然后：
1. 划分上传区、结果区、列表项、预览/下载动作、空态/错误态。
2. 在不改变现有功能路径的前提下，拆分 UI 区块和纯辅助逻辑。
3. 如果有重复映射或复杂条件渲染，做可读性整理。
4. 给出关键测试建议。
```

#### `frontend/src/features/diagram/hooks/useDiagramExtractSearch.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/diagram/hooks/useDiagramExtractSearch.ts。

背景：
- 这个文件属于 `/diagram` 页面。
- 文件约 270 行。
- 它是抽图/搜图/编辑相关的核心 hook，可能把上传、搜索、文本提取、编辑状态和异步请求都堆在了一起。

请先用 CodeGraph 梳理对外接口、内部状态、请求流程和下游消费方，然后：
1. 判断它是否承担了过多职责。
2. 在不改变对外 API 的前提下，拆出更清晰的 helpers、内部 hooks 或状态片段。
3. 保持 `/diagram` 页面现有行为不变，包括上传、搜索、恢复和编辑流程。
4. 给出最关键的 hook 级回归测试建议。
```

#### `frontend/src/features/diagram/utils/beautifySvg.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/diagram/utils/beautifySvg.ts。

背景：
- 这个文件属于 `/diagram` 页的 SVG 处理工具。
- 文件约 220 行。
- 工具函数长成这样，通常意味着字符串处理、规则分支和异常兜底已经比较复杂。

请先用 CodeGraph 看清楚调用方和输入输出约定，然后：
1. 梳理当前负责的转换步骤和边界条件。
2. 在不改变输出契约的前提下，把解析、格式化、清理和容错逻辑拆成更易测的纯函数。
3. 优先补充单元测试，而不是只做表面格式整理。
4. 说明最容易回归的边界输入。
```

### 其他业务页

#### `frontend/src/features/study-notes/pages/StudyNotesPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/study-notes/pages/StudyNotesPage.tsx。

背景：
- 这个文件对应 `/study-notes` 页面。
- 文件约 273 行。
- 页面本身已经偏重，可能把生成、浏览、复习和局部操作都堆在一起。

请先用 CodeGraph 理解区块和状态来源，然后：
1. 盘点页面主体承担的所有职责。
2. 在不改变工作流的前提下，把可拆分 section、派生状态和动作处理拆开。
3. 保持现有页面布局和用户操作路径不变。
4. 给出最关键的回归点。
```

#### `frontend/src/features/knowledge-base/hooks/useKnowledgeBase.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/knowledge-base/hooks/useKnowledgeBase.ts。

背景：
- 这个文件属于 `/knowledge-base` 页面。
- 文件约 239 行。
- 它可能同时处理知识库列表、当前选中项、上传/删除、检索测试和刷新逻辑。

请先用 CodeGraph 梳理对外接口、内部状态和 API 调用，然后：
1. 判断哪些职责适合拆成更细的 domain helpers 或子 hooks。
2. 在不改变现有 hook API 的前提下，让状态流和异步逻辑更清晰。
3. 保持页面行为、缓存刷新和错误处理一致。
4. 给出最关键的 hook 测试建议。
```

#### `frontend/src/features/knowledge-base/components/document-manager/TestRetrievalPanel.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/knowledge-base/components/document-manager/TestRetrievalPanel.tsx。

背景：
- 这个文件属于 `/knowledge-base` 页面。
- 文件约 210 行。
- 它通常混合输入、参数配置、触发检索、结果展示和错误处理。

请先用 CodeGraph 理解 props、依赖状态和动作，然后：
1. 划分测试输入区、参数区、结果区和辅助提示区。
2. 在不改变检索测试体验的前提下，拆分过长 JSX 和结果格式化逻辑。
3. 保持触发、loading、错误态和结果展示行为一致。
4. 给出关键测试建议。
```

#### `frontend/src/features/knowledge-base/components/DocumentManager.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/knowledge-base/components/DocumentManager.tsx。

背景：
- 这个文件属于 `/knowledge-base` 页面。
- 文件约 201 行。
- 它是文档管理主组件，已经开始承载过多装配逻辑。

请先用 CodeGraph 看清楚它组织了哪些文档管理子区块，然后：
1. 判断哪些职责应留在容器，哪些应下沉到子组件或 hooks。
2. 做一次小而稳的整理，提升可读性和后续扩展性。
3. 保持文档上传、删除、查看和刷新路径不变。
4. 给出最重要的回归点。
```

#### `frontend/src/features/video-gen/components/StepUpload.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/video-gen/components/StepUpload.tsx。

背景：
- 这个文件属于 `/video-gen` 页面。
- 文件约 267 行。
- 它可能同时处理文件输入、校验、预览、配置和下一步动作。

请先用 CodeGraph 理解它在整个 workflow 里的位置，然后：
1. 划分上传区、配置区、预览区、错误态和操作区。
2. 在不改变上传体验和工作流的前提下，拆分过长 JSX 和校验逻辑。
3. 保持文件校验、禁用态、下一步状态切换不变。
4. 给出关键回归测试建议。
```

#### `frontend/src/features/video-gen/components/VideoPlayerWithChapters.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/video-gen/components/VideoPlayerWithChapters.tsx。

背景：
- 这个文件属于 `/video-gen` 页面。
- 文件约 237 行。
- 它通常会混合播放器控制、章节同步、时间轴和局部交互。

请先用 CodeGraph 梳理 props、播放器状态和章节联动，然后：
1. 判断播放控制、章节列表、时间同步和渲染辅助逻辑是否可以更清晰分层。
2. 在不改变播放体验的前提下，拆分控制区和纯 helpers。
3. 注意不要引入新的同步 bug 或性能回退。
4. 给出跳章、播放状态切换、时间同步这些关键回归点。
```

#### `frontend/src/features/video-gen/components/SceneCard.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/video-gen/components/SceneCard.tsx。

背景：
- 这个文件属于 `/video-gen` 页面。
- 文件约 222 行。
- 它可能同时承担场景内容展示、编辑入口、排序/状态和局部操作。

请先用 CodeGraph 了解 props 和工作流位置，然后：
1. 划分展示区、编辑动作、状态标签和辅助逻辑。
2. 在不改变卡片交互和布局的前提下，拆分复杂分支和重复 JSX。
3. 保持卡片更新、选择和操作按钮行为一致。
4. 给出关键回归测试建议。
```

#### `frontend/src/features/file-center/components/ToolHistoryTab.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/file-center/components/ToolHistoryTab.tsx。

背景：
- 这个文件属于 `/file-center` 页面。
- 文件约 276 行。
- 它通常会把筛选、表格、详情入口和空态/错误态堆在一起。

请先用 CodeGraph 理解数据来源、筛选条件和详情联动，然后：
1. 划分工具栏、列表区、状态提示和动作区。
2. 在不改变历史查询体验的前提下，拆分列表列定义、格式化逻辑和过长 JSX。
3. 保持筛选、展开详情和分页/刷新行为一致。
4. 给出最关键的回归点。
```

#### `frontend/src/features/file-center/components/HistoryDetailModal.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/file-center/components/HistoryDetailModal.tsx。

背景：
- 这个文件属于 `/file-center` 页面。
- 文件约 213 行。
- 它是历史详情弹窗，容易把字段排版、条件渲染和动作处理杂糅。

请先用 CodeGraph 了解输入数据和展示规则，然后：
1. 划分头部信息、详情区、结果区和动作区。
2. 在不改变弹窗展示内容和交互的前提下，拆分格式化逻辑和重复渲染片段。
3. 保持打开/关闭、复制/下载、异常展示等行为一致。
4. 给出关键回归测试建议。
```

#### `frontend/src/features/grading/pages/GradingWorkbenchPage.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/grading/pages/GradingWorkbenchPage.tsx。

背景：
- 这个文件对应 `/mailbox/grade_workbench/:submissionId`。
- 文件约 425 行。
- 它可能把批改主流程、试卷预览、评分表、AI 助手和保存动作都放在一个页面里。

请先用 CodeGraph 梳理主要区块、状态来源和异步动作，然后：
1. 给出页面结构图。
2. 明确哪些逻辑应留在 workbench 容器，哪些应拆到 panel、viewer 或 hooks。
3. 在不改变批改流程和布局的前提下，优先抽离评分区、文档区、AI 辅助区和页面动作区。
4. 把复杂派生状态和条件分支整理成 helpers。
5. 标出评分保存、切换 submission、AI 助手联动和 PDF 定位这些高风险回归点。
```

#### `frontend/src/features/grading/hooks/useCozeAssistant.ts`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/grading/hooks/useCozeAssistant.ts。

背景：
- 这个文件属于 `/mailbox/grade_workbench/:submissionId`。
- 文件约 283 行。
- 它可能同时处理消息流、会话状态、触发动作和错误处理。

请先用 CodeGraph 理解外部接口、调用方和异步流程，然后：
1. 判断是否把 AI 会话状态、请求编排和 UI 副作用耦合得过深。
2. 在不改变对外 API 的前提下，拆分 stream 处理、错误归一化、会话动作和辅助函数。
3. 保持现有工作流、消息顺序和异常路径不变。
4. 给出最关键的 hook 级回归测试建议。
```

#### `frontend/src/features/grading/components/PDFViewer.tsx`

```text
请你在 D:\Desktop\Intelligent-Edu-Platform 仓库里处理 frontend/src/features/grading/components/PDFViewer.tsx。

背景：
- 这个文件属于 `/mailbox/grade_workbench/:submissionId`。
- 文件约 208 行。
- 它是批改台里的 PDF 预览组件，已经进入“改起来容易变乱”的区间。

请先用 CodeGraph 理解 props、批改台联动和用户交互，然后：
1. 判断文档加载、页码/定位、缩放或标注相关逻辑是否应该分层。
2. 在不改变阅读体验的前提下，把纯渲染辅助逻辑和交互控制拆清楚。
3. 注意不要引入定位、缩放、滚动同步方面的回归。
4. 给出最关键的回归测试建议。
```

## 当前没有明显超长文件的页面

- `/forgot-password`
- `/questions`
- `/mailbox`
- `/publish-homework`

如果你想继续做第二梯队排查，可以把阈值降到 150 到 180 行，再看这些文件：

- `frontend/src/features/question-bank/hooks/useQuestionGenerator.ts`
- `frontend/src/features/question-bank/components/Step3Generate/components/QuestionOpsPanel.tsx`
- `frontend/src/features/mailbox/components/SubmissionsStep.tsx`
- `frontend/src/features/homework/pages/PublishHomeworkPage.tsx`
