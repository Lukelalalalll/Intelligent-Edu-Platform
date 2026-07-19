# Vercel 前端部署指南

本项目的推荐上线方式是：**Vercel 只部署 `frontend/` 的 React/Vite 静态前端，后端继续使用 Docker Compose 分服务部署，并通过 `edge-nginx` 作为唯一公网 API 网关**。

不要把 FastAPI 后端部署到 Vercel Serverless。当前后端包含多服务、长连接/流式任务、文件生成、MongoDB、SearXNG 和内部网关鉴权，更适合继续运行在 Docker 环境中。

## 1. 目标架构

- 浏览器访问 Vercel 前端域名，例如 `https://your-vercel-app.vercel.app`
- 前端通过 `VITE_API_ROOT=https://api.your-domain.com` 请求 Docker 网关
- 公网只暴露 `edge-nginx`，内部服务如 `api-core`、`slides-service`、`video-service` 不直接暴露
- `edge-nginx` 负责把 `/api/*`、`/static/*`、`/generated/*`、`/app_data/*` 转发到对应服务，并注入 `X-Internal-Gateway`

## 2. Vercel 项目配置

在 Vercel 导入仓库时使用下面配置：

| 项目 | 值 |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | `Vite` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

这些设置已经写入 `frontend/vercel.json`，但 **Root Directory 仍需要在 Vercel 项目设置中选择 `frontend`**。

Vercel 环境变量：

```env
VITE_API_ROOT=https://api.your-domain.com
VITE_GOOGLE_AUTH_CLIENT_ID=your-google-client-id-if-used
```

不要在 Vercel 前端环境变量里设置 `INTERNAL_GATEWAY_TOKEN`。所有 `VITE_*` 变量都会进入浏览器包，内部网关密钥只能留在 Docker 后端和 `edge-nginx` 里。

## 3. Docker 后端网关配置

先为 `edge-nginx` 准备一个公网 HTTPS 域名，例如：

```text
https://api.your-domain.com
```

可以用云服务器 Nginx/Caddy、Cloudflare Tunnel、负载均衡器或其他 TLS 终止层把这个域名转到 `edge-nginx`。只开放网关入口，不开放内部服务端口。

生产 compose 环境文件至少需要包含：

```env
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
JWT_COOKIE_SAMESITE=none
INTERNAL_GATEWAY_TOKEN=CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING
SECRET_KEY=CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING
JWT_SECRET_KEY=CHANGE_ME_TO_A_DIFFERENT_RANDOM_64_CHAR_STRING
SEARXNG_SECRET_KEY=CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING
```

说明：

- `ALLOWED_ORIGINS` 必须精确包含实际访问前端的 HTTPS origin
- 当前 `docker-compose.yml` 已保持 `JWT_COOKIE_SECURE=true`
- 当前 `docker-compose.yml` 支持通过 `JWT_COOKIE_SAMESITE=none` 让跨站 Vercel 前端携带登录 Cookie
- 如果前端和后端改成同一站点下的子域名，仍可以保留 `SameSite=None`，也可以按安全策略改回 `lax`
- Preview 域名是动态的；如果要让 Preview 也连生产后端，需要把每个 Preview origin 加入 `ALLOWED_ORIGINS`

## 4. 部署顺序

1. 部署 Docker 后端，并确认 `edge-nginx` 健康检查可用
2. 给 `edge-nginx` 配公网 HTTPS 域名
3. 用生产 env 启动 Docker Compose
4. 在 Vercel 导入仓库，Root Directory 选 `frontend`
5. 设置 `VITE_API_ROOT=https://api.your-domain.com`
6. 部署 Vercel 前端

## 5. 验证清单

本地构建：

```bash
cd frontend
npm ci
npm run build
```

上线后检查：

- `https://api.your-domain.com/healthz` 返回 `ok`
- Vercel 前端首页能打开，直接刷新深层路由不会 404
- 浏览器 Network 里 API 请求发往 `https://api.your-domain.com/api/...`
- 登录响应能写入 `Secure; SameSite=None` Cookie
- 登录后的请求能继续带上 Cookie 和 `X-CSRF-Token`
- `/static/*`、`/generated/*`、`/app_data/*` 资源都能访问
- 上传、PPT/课件生成、视频进度流、图表/图片生成等长任务链路能跑通

## 6. 已知非阻塞项

`frontend` 当前可以执行 Vite build，但 `npm run typecheck` 仍有历史 TypeScript 问题。Vercel 部署命令目前只使用 `npm run build`，所以这些类型问题不直接阻塞前端静态部署；如果以后把 typecheck 加进 CI 或 Vercel 构建门槛，需要先单独修复。
