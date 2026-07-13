# Docker 架构说明

> 目的：说明这个项目当前 Docker / Docker Compose 的真实部署结构，重点回答“现在是不是分开的”以及“前后端和各后端服务是怎么拆的”。

## 1. 结论先说

**是分开的。**

但不是简单的：

- 1 个前端容器
- 1 个后端容器

而是当前这套 Docker 结构：

- 1 个前端静态站点 + 网关容器：`edge-nginx`
- 1 个 MongoDB 容器：`mongo`
- 1 个搜索容器：`searxng`
- **7 个后端服务容器**
  - `api-core`
  - `slides-service`
  - `highlighter-service`
  - `question-service`
  - `visual-service`
  - `study-notes-service`
  - `video-service`

也就是说，**前端是单独的，后端不是一个整体容器，而是按业务能力拆成多个 FastAPI 服务**。

---

## 2. 当前 Docker 组成

配置来源：

- [docker-compose.yml](D:\Desktop\Intelligent-Edu-Platform\docker-compose.yml)
- [deploy/Dockerfile.frontend](D:\Desktop\Intelligent-Edu-Platform\deploy\Dockerfile.frontend)
- [deploy/Dockerfile.backend](D:\Desktop\Intelligent-Edu-Platform\deploy\Dockerfile.backend)
- [deploy/nginx.conf](D:\Desktop\Intelligent-Edu-Platform\deploy\nginx.conf)

### 服务总览

| 服务名 | 类型 | 作用 |
| --- | --- | --- |
| `mongo` | 基础设施 | MongoDB 数据库 |
| `api-core` | 后端 | 核心聚合 API：Auth / Admin / AI / Chat / Mailbox / Grading / File Center / Homework |
| `slides-service` | 后端 | Slides 主流程 |
| `highlighter-service` | 后端 | Slides 高亮器 |
| `question-service` | 后端 | Question Bank / Question Generator |
| `visual-service` | 后端 | Diagram + Image Extractor |
| `study-notes-service` | 后端 | Study Notes / Flashcards / Review Plan |
| `video-service` | 后端 | Video Generation |
| `edge-nginx` | 前端 + 网关 | 承载前端静态资源，并把 `/api/*` 分发到各后端服务 |
| `searxng` | 基础设施 | Web 搜索服务，供 AI / 搜索相关能力使用 |

---

## 3. 前端和后端是不是分开的

### 前端

前端是单独一个镜像：

- 构建文件：
  - [deploy/Dockerfile.frontend](D:\Desktop\Intelligent-Edu-Platform\deploy\Dockerfile.frontend)

它做两件事：

1. 用 Node 构建 `frontend/` 的 Vite 项目
2. 用 Nginx 提供静态文件服务

所以前端在 Docker 里不是 dev server，也不是 `vite preview`，而是：

- `npm run build`
- Nginx 提供 `dist/`

### 后端

后端不是一个容器，而是多个容器。

这些容器都来自同一个多阶段 Dockerfile：

- [deploy/Dockerfile.backend](D:\Desktop\Intelligent-Edu-Platform\deploy\Dockerfile.backend)

但它通过不同 `target` 拆成不同镜像阶段：

- `core`
- `slides`
- `highlighter`
- `questions`
- `visual`
- `study-notes`
- `video`

每个容器再通过不同的 `APP_MODULE` 启动不同 FastAPI app。

所以准确说法是：

- **代码仓库是单仓**
- **Docker 部署是前端单独 + 后端微拆分**

---

## 4. 后端是怎么拆的

### 4.1 `api-core`

容器名：`api-core`

- 启动模块：`backend.apps.core:app`
- 容器端口：`5009`

负责：

- Auth / Profile
- Admin
- AI Interaction
- Knowledge Base
- Chat
- Teacher Mailbox
- Grading
- AI Gateway
- File Center
- Homework

对应入口：

- [backend/apps/core.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\core.py)

### 4.2 `slides-service`

容器名：`slides-service`

- 启动模块：`backend.apps.slides:app`
- 容器端口：`5010`

负责：

- Slides 解析、生成、模板、交付、编辑器主流程

对应入口：

- [backend/apps/slides.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\slides.py)

### 4.3 `highlighter-service`

容器名：`highlighter-service`

- 启动模块：`backend.apps.highlighter:app`
- 容器端口：`5012`

负责：

- Slides 高亮保存 / 读取 / 分类

对应入口：

- [backend/apps/highlighter.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\highlighter.py)

### 4.4 `question-service`

容器名：`question-service`

- 启动模块：`backend.apps.questions:app`
- 容器端口：`5013`

负责：

- 题目上传、抽取、生成、导出、历史回放、Question Ops

对应入口：

- [backend/apps/questions.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\questions.py)

### 4.5 `visual-service`

容器名：`visual-service`

- 启动模块：`backend.apps.visual:app`
- 容器端口：`5014`

负责：

- Diagram
- Image Extractor

对应入口：

- [backend/apps/visual.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\visual.py)

### 4.6 `study-notes-service`

容器名：`study-notes-service`

- 启动模块：`backend.apps.study_notes:app`
- 容器端口：`5015`

负责：

- Study Notes
- Flashcards
- Study Plan
- Review Queue

对应入口：

- [backend/apps/study_notes.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\study_notes.py)

### 4.7 `video-service`

容器名：`video-service`

- 启动模块：`backend.apps.video:app`
- 容器端口：`5011`

负责：

- 脚本优化
- 场景生成
- 视频渲染
- 章节 / Quiz 产物

对应入口：

- [backend/apps/video.py](D:\Desktop\Intelligent-Edu-Platform\backend\apps\video.py)

---

## 5. 路由流量是怎么走的

请求入口不是直接打到各后端容器，而是先到：

- `edge-nginx`

也就是：

1. 浏览器访问 `http://localhost`
2. 请求先进入 `edge-nginx`
3. Nginx 再按路径转发到不同后端服务

配置文件：

- [deploy/nginx.conf](D:\Desktop\Intelligent-Edu-Platform\deploy\nginx.conf)

### 核心路由分发

| 请求路径 | 转发目标 |
| --- | --- |
| `/api/slides/*` | `slides-service` |
| `/api/sub1/*` | `slides-service` |
| `/api/questions/*` | `question-service` |
| `/api/diagram/*` | `visual-service` |
| `/api/image-extractor/*` | `visual-service` |
| `/api/study-notes/*` | `study-notes-service` |
| `/api/video/*` | `video-service` |
| `/api/*` 其余默认 | `api-core` |

### 特殊拆分

Slides 有额外拆分：

- `/api/slides/classify-highlights`
- `/api/slides/save_highlights`
- `/api/slides/load_highlights/*`
- `/api/slides/download/*`

这些不是走 `slides-service`，而是走：

- `highlighter-service`

所以 Slides 在 Docker 层面其实已经拆成了两个后端服务：

- 主 Slides 服务
- Highlighter 服务

---

## 6. 端口情况

### 对外暴露

当前 Compose 里只有一个对外主要入口：

- `edge-nginx` -> `80:80`

也就是说，对宿主机暴露的默认入口是：

- `http://localhost`

### 容器内部端口

| 服务 | 内部端口 |
| --- | --- |
| `api-core` | `5009` |
| `slides-service` | `5010` |
| `video-service` | `5011` |
| `highlighter-service` | `5012` |
| `question-service` | `5013` |
| `visual-service` | `5014` |
| `study-notes-service` | `5015` |
| `mongo` | `27017` |
| `searxng` | `8080` |

这些后端端口都只是 `expose`，**默认不直接暴露给宿主机**。

---

## 7. 网络是怎么分的

Compose 里定义了两个网络：

### `app`

- `internal: false`
- 用于：
  - `edge-nginx`
  - 各后端服务
  - `searxng`

这是应用层通信网络。

### `data`

- `internal: true`
- 用于：
  - `mongo`
  - 各后端服务

这是数据库内网。

也就是说：

- `mongo` 不直接暴露给外部
- 前端 Nginx 不直接连 `data` 网络
- 后端服务同时连 `app` 和 `data`

这个拆法是比较清晰的。

---

## 8. 存储卷是怎么分的

当前不是一个共享大卷，而是按服务拆卷。

### 数据库卷

- `mongo_data`

### Core 卷

- `core_uploads`
- `core_static`
- `core_generated`
- `rag_vectorstore`

### Slides 卷

- `slides_uploads`
- `slides_md`
- `slides_highlights`
- `slides_ppt_results`
- `slides_script_results`
- `slides_generated`

### Questions 卷

- `questions_uploads`
- `questions_generated`
- `questions_screenshots`

### Visual 卷

- `visual_uploads_sub3`
- `visual_uploads_sub4`
- `visual_generated_sub3`
- `visual_generated_sub4`
- `visual_static_sub4`

### Study Notes 卷

- `study_notes_uploads`
- `study_notes_generated`

### Video 卷

- `video_tmp`
- `video_artifacts`

这意味着现在 Docker 的数据层也是**按模块分开的**，不是所有服务共写一套本地目录。

---

## 9. 镜像构建方式

## 前端镜像

前端镜像独立构建：

- 基础镜像：`node:20-alpine`
- 构建完成后切到：`nginx:alpine`

流程：

1. 安装前端依赖
2. `npm run build`
3. 拷贝 `dist/` 到 Nginx

这说明：

- 前端容器是纯静态产物容器
- 不包含 Node 运行时服务逻辑

## 后端镜像

后端镜像来自同一个多阶段 Dockerfile，但按 target 区分服务。

特点：

- 基础阶段：`python:3.11-slim`
- 所有服务共享基础层
- 各服务再安装自己的依赖文件：
  - `backend/requirements/core.txt`
  - `backend/requirements/slides.txt`
  - `backend/requirements/highlighter.txt`
  - `backend/requirements/questions.txt`
  - `backend/requirements/visual.txt`
  - `backend/requirements/study-notes.txt`
  - `backend/requirements/video.txt`

这意味着：

- 代码仓库共用一套后端源码
- 镜像依赖层按模块裁剪
- Slides / Video 会装更多重型依赖

---

## 10. 各后端服务不是完全同构

虽然都是 FastAPI + Gunicorn，但它们不是完全一样。

### 依赖差异

- `slides-service`
  - `libreoffice`
  - `poppler-utils`
  - `tesseract-ocr`
  - Playwright + Chromium
- `video-service`
  - `ffmpeg`
  - Playwright + Chromium
- `question-service`
  - OCR / PDF 处理依赖
- `visual-service`
  - 图像 / PDF 依赖

### 超时差异

不同服务的 `GUNICORN_TIMEOUT` 不一样：

- `api-core`: `180`
- `slides-service`: `300`
- `highlighter-service`: `240`
- `question-service`: `300`
- `visual-service`: `300`
- `study-notes-service`: `300`
- `video-service`: `600`

这也说明 Docker 设计上已经把它们视作不同负载类型。

---

## 11. 环境变量也是分开的

后端不是只吃一个 `.env`，而是支持：

- 公共环境文件
- 服务专属环境文件

现有示例文件：

- [backend/.env.shared.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.shared.example)
- [backend/.env.core.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.core.example)
- [backend/.env.slides.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.slides.example)
- [backend/.env.highlighter.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.highlighter.example)
- [backend/.env.questions.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.questions.example)
- [backend/.env.study-notes.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.study-notes.example)
- [backend/.env.video.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.video.example)
- [backend/.env.visual.example](D:\Desktop\Intelligent-Edu-Platform\backend\.env.visual.example)

Compose 的使用方式是：

- 先吃 `backend/.env.shared`
- 再吃服务自己的 `.env.xxx`
- 最后可回退到 `backend/.env`

所以现在这套部署不是“一个大环境文件驱动全部服务”，而是**支持每个服务有独立配置**。

---

## 12. 内部安全设计

当前 Nginx 转发给后端时会统一带：

- `X-Internal-Gateway`

对应变量：

- `INTERNAL_GATEWAY_TOKEN`

后端 app factory 里也启用了网关校验中间件。

这意味着：

- 后端服务预期是被网关调用
- 不是设计成直接裸露给公网逐个访问

这进一步说明现在的部署形态是：

- **前端入口统一**
- **后端服务内部拆分**
- **对外仍表现为一个站点**

---

## 13. 当前架构图

```text
Browser
  |
  v
edge-nginx :80
  |-- /                  -> frontend static files
  |-- /api/*             -> api-core
  |-- /api/slides/*      -> slides-service
  |-- /api/slides/*(高亮相关) -> highlighter-service
  |-- /api/questions/*   -> question-service
  |-- /api/diagram/*     -> visual-service
  |-- /api/image-extractor/* -> visual-service
  |-- /api/study-notes/* -> study-notes-service
  |-- /api/video/*       -> video-service
  |
  +--> 所有后端服务
          |
          +--> mongo (data network)
          +--> searxng (app network，部分服务可用)
```

---

## 14. 这套 Docker 架构的真实特点

### 是什么

- 单仓代码库
- 多后端服务拆分
- 单一 Nginx 网关入口
- 前端静态站点和 API 网关合一
- Mongo 单实例

### 不是啥

不是：

- 单体前后端双容器
- 前端直接访问某一个后端容器
- 所有后端模块都跑在一个 FastAPI 进程里
- 每个后端服务都有独立公网入口

---

## 15. 对你后续让 Codex 优化的意义

如果你后面要按部署层优化，可以直接按下面粒度提：

- `只优化 Docker 前端入口（edge-nginx + Dockerfile.frontend）`
- `只优化 api-core 容器配置`
- `只优化 slides-service + highlighter-service 的 Docker 拆分`
- `只优化 video-service 的镜像体积和依赖`
- `只优化 docker-compose 的网络、卷和健康检查`

如果你想按“业务模块 + Docker”一起优化，建议绑定提法：

- `M19 Slides + Docker`
- `M20 Video + Docker`
- `M13 Question Bank + Docker`

---

## 16. 一句话总结

**当前 Docker 方案已经是分开的，而且分得比较细：前端 1 个容器，后端 7 个业务服务容器，再加 Mongo、SearxNG 和统一 Nginx 网关。**
