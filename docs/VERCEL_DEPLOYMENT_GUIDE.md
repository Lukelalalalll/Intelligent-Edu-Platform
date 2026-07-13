# Vercel 部署指南 (本地 Ollama 混合架构)

本指南针对**将前端 (React/Vite) 和后端 (FastAPI) 部署到 Vercel 免费/Pro 版**，同时**保留本地机器 (Windows/Mac) 运行 Ollama 大模型**的混合架构。

## 1. 架构原理

*   **前端:** 托管在 Vercel 的全球 CDN 边缘节点（纯静态文件）。
*   **后端 API:** 托管在 Vercel 的 Serverless Functions（无服务器函数，基于 `Python`）。
*   **AI 算力 (Ollama):** 运行在你家里的带 GPU 的电脑上。
*   **通信桥梁 (内网穿透):** 通过 Cloudflare Tunnels 或 Ngrok 等工具，将你本地的 Ollama 映射为一个公网 HTTPS 地址供 Vercel 调用。

> **⚠️ Vercel 的超时限制 (极重要)**
> Vercel 免费版 (Hobby) 的 Serverless 函数**最大执行时间为 10 秒**！
> 大模型生成通常会超过 10 秒，如果你不使用流式输出 (Streaming) 或者不升级到 Pro 版 (最长 300 秒)，你的接口将会频繁报 `504 Gateway Timeout`。请确保后端的大模型对话接口全部采用**流式返回 (`StreamingResponse`)**。

---

## 2. 核心步骤：将本地 Ollama 暴露到公网

为了让部署在云端的 Vercel 能访问你的大模型，你需要内网穿透。这里强烈推荐 **Cloudflare Tunnels (免费、不限速、不间断)** 或 **Ngrok**。

### A. 简易测试跑法 (Ngrok)
最简单的方法，直接将本机的 11434 端口穿透出去：
```bash
# 在你运行 Ollama 的电脑上执行
ngrok http 11434
```
你会得到一个类似 `https://abc-123.ngrok-free.app` 的公网地址。
把它复制下来，后面会填入 Vercel 的环境变量中。

*(注意：Ngrok 免费版重启后 URL 会变，且没有身份验证，任何人拿到这个 URL 都可以白嫖你的本机的算力。正式使用推荐使用带 Auth 的 Cloudflare Tunnel，在前面挂一个 Nginx/Caddy 进行鉴权)*

---

## 3. 配置项目以适配 Vercel

要让 Vercel 知道这是一个“前端 + FastAPI后端”的 Monorepo（单体仓库），我们需要在项目根目录创建一个 `vercel.json` 文件。

### 第一步：在根目录创建 `vercel.json`
在工程根目录（也就是包含 `frontend` 和 `backend` 文件夹的地方）新建 `vercel.json`：

```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/main.py",
      "use": "@vercel/python",
      "config": {
        "maxDuration": 10
      }
    },
    {
      "src": "frontend/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/main.py"
    },
    {
      "src": "/(.*)",
      "dest": "frontend/dist/$1"
    }
  ]
}
```
*解释：所有的 `/api/*` 请求会被路由给 FastAPI (`backend/main.py`)，其他的请求会被路由给前端打包好的静态文件。*

### 第二步：配置根目录的 `package.json`
Vercel 默认会在根目录找打包脚本。在根目录创建一个 `package.json` (如果已有则添加 scripts)：

```json
{
  "name": "intelligent-edu-platform",
  "scripts": {
    "build": "cd frontend && npm install && npm run build"
  }
}
```

### 第三步：修改前端的 API 请求及路由
既然前后端部署在了同一个域名下（通过 Vercel 处理了路由转发），你需要确保前端项目里的 `.env` 中的 `VITE_API_ROOT` 在生产环境中为空或者相对路径：

在 `frontend/.env.production` 中写：
```env
VITE_API_ROOT=
```
这样前端在 Vercel 上请求 API 时，会自动请求当前域名下的 `/api/...`。

---

## 4. 部署到 Vercel

最推荐的方式是通过 GitHub 部署：

1. **提交代码到 GitHub：**
   将整个仓库推送到你的 GitHub。
2. **在 Vercel 中导入：**
   登录 [Vercel](https://vercel.com/)，点击 "Add New..." -> "Project"，选中你刚刚推送的 GitHub 仓库。
3. **设置环境变量 (Environment Variables)：**
   在部署前（或者部署后的 Settings 里面），配置你的后端所需的环境变量。
   最关键的是配置你的 Ollama 地址，将刚才内网穿透拿到的 URL 填进去：
   * `OLLAMA_BASE_URL` = `https://abc-123.ngrok-free.app`
   * （以及其他的比如 `MONGO_URI`，注意你不能填 `localhost:27017` 了，必须是一个公网可访问的 MongoDB 地址，比如 MongoDB Atlas 免费云数据库）。
4. **点击 Deploy。**

---

## 5. 重要注意事项

1. **MongoDB 不能是本地了：**
   当你把代码放到 Vercel 上，`localhost` 就指的是 Vercel 的服务器了。因此，你需要注册一个免费的 **MongoDB Atlas** 云端数据库，获取形如 `mongodb+srv://user:pass@cluster.mongodb.net/` 的链接，并填入 Vercel 的环境变量 `MONGO_URI` 中。
2. **避免超时 (Streaming)：**
   确保你在 `backend/routes/chat_routes.py` 或相关调用大模型的地方，采用了 FastAPI 的 `StreamingResponse`。
3. **后端依赖：**
   仔细核对 `backend/requirements.txt`。Vercel 会自动根据这个文件安装 Python 包。如果有不需要在云端运行的包（比如本地 GPU 相关的包，或是非常大的包如 `torch`），请考虑将其移除，以免超出 Vercel 的 Serverless Function 提及限制（通常解压后不能超过 250MB）。
