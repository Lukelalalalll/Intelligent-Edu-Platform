# Intelligent Edu Platform

This is a full-stack web application featuring a FastAPI backend and a React (Vite) frontend.

## Prerequisites

- **Node.js** (v16+ recommended)
- **Python** (v3.10+ recommended)

## 🚀 How to Run the Project

You will need to open **two separate terminal windows**: one for the backend and one for the frontend.

### 1. Start the Backend (FastAPI)

Open your first terminal and run the following commands from the project root directory:

```bash
# 1. Activate the correct virtual environment
source backend/venv/bin/activate

# 2. (Optional) If you haven't installed the dependencies yet:
pip install -r backend/requirements.txt

# 3. Start the FastAPI server
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 5009 --reload
```
The backend API will be available at `http://localhost:5009`.


### 2. Start the Frontend (React + Vite)

Open a **new, second terminal** and run the following commands:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. (Optional) If you haven't installed node modules yet:
npm install

# 3. Start the Vite development server
npm run dev
```
The frontend will typically run at `http://localhost:5173` (or check the terminal output for the exact URL). Opening this URL in your browser will load the application.

## Project Structure

- `backend/` - Contains the Python FastAPI application, routes, services, and core configuration.
- `frontend/` - Contains the React application created with Vite, including components, pages, and styles.

## Smart Homework Grading (Mailbox)

- New teacher dashboard: visit `/teacher/mailbox` to browse courses → assignments → submissions (data from `data/courses.json`).
- Grading workbench: `/teacher/grade/:submissionId` shows PDF, annotations, rubric scoring, and Coze.ai assistant.
- Static PDF samples live in `data/submissions/` and are served via `/data/...` by FastAPI.
- Annotation and score persistence uses JSON files in `data/annotations/`.

### Backend endpoints
- `GET /api/teacher/courses` / `assignments/{courseId}` / `submissions/{assignmentId}` / `submission/{submissionId}`
- `POST /api/teacher/annotations` (add/update) and `DELETE /api/teacher/annotations/{annotationId}` (requires `submissionId` query param)
- `POST /api/teacher/submission/{submissionId}/score` to persist scores and feedback
- `POST /api/ai/analyze`, `/api/ai/feedback`, `/api/ai/annotate` proxy to Coze.ai (mocked when no API key)

### Environment
Copy `.env.example` to `.env` and fill `COZE_API_KEY`, `COZE_BOT_ID`, `COZE_API_URL`. Frontend can override API root with `VITE_API_ROOT`.

## Production Deployment

### 1. Required Environment Variables (Security Baseline)

- `ENV=production` (or `staging`/`preprod`)
- `SECRET_KEY` and `JWT_SECRET_KEY`
	- Must be strong random values (min length 32, mixed character classes, high entropy)
	- Weak/default values are rejected at startup in production-like environments
- `MONGO_URI` (default internal compose DNS: `mongodb://mongo:27017/intelligent_edu`)
- `JWT_COOKIE_SAMESITE` (`lax`/`strict`/`none`)
- `JWT_COOKIE_SECURE=true` in production
- Optional AI keys: `DEEPSEEK_API_KEY`, `COZE_TOKEN`, `ZHIPU_API_KEY`

### 2. Build and Start (Docker Compose)

```bash
docker compose build
docker compose up -d
```

Notes:
- MongoDB is not exposed to host by default in production compose.
- Frontend is built in a reproducible multi-stage image (`deploy/Dockerfile.frontend`), not from host `frontend/dist` mount.
- Backend runs as non-root user in container.

### 3. Health Checks

- Backend: `GET /api/health`
- Nginx container: `GET /healthz`
- Mongo: internal `db.adminCommand('ping')`

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f mongo
```

### 4. Rollback Checklist

1. Keep previous image tags available in registry.
2. Re-deploy previous known-good images.
3. Verify `/healthz` and `/api/health` after rollback.
4. Confirm authentication cookie behavior and key envs are intact.
5. Re-run smoke checks (`pytest`, frontend typecheck/lint/test).

### 5. Quick Troubleshooting

- Startup exits with key error:
	- Check `SECRET_KEY` and `JWT_SECRET_KEY` strength and env injection.
- Login fails in production behind HTTPS:
	- Verify `JWT_COOKIE_SECURE=true`, reverse-proxy headers, and browser cookie policy.
- API reachable but UI blank:
	- Check nginx config syntax and frontend image build logs.
- Mongo healthcheck failing:
	- Confirm `mongo` service is healthy and backend `MONGO_URI` points to `mongo:27017`.
- Slow/blocked auth or upload requests:
	- Review nginx rate-limit zones and adjust burst/rate for expected traffic.
