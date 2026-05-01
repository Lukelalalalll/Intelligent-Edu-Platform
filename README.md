# Intelligent Edu Platform

## Project Overview
Intelligent Edu Platform is a comprehensive, full-stack educational system designed to provide AI-powered learning assistance. The platform integrates a Retrieval-Augmented Generation (RAG) educational chatbot, a document-based knowledge indexing system, an AI grading workbench, and capabilities for automated slide and lecture video generation.

## Technical Architecure
- **Backend:** FastAPI, Python 3.11+, MongoDB (Motor), ChromaDB, LangChain.
- **Frontend:** React 18, TypeScript, Vite, Zustand.
- **Deployment:** Docker Compose, Nginx.

---

## 1. Prerequisites
Before starting, ensure the following tools are installed on your machine:
- Python 3.11 or greater
- Node.js 18 or greater (LTS recommended)
- npm (Node Package Manager)
- MongoDB 7.0+ (running locally at mongodb://localhost:27017 or via Docker)

---

## 2. Project Setup & Configuration

### Environment Variables
1. At the root of the project, create the main backend environment file by copying the given template (or manually create `.env` if none exists).
     cp .env.example .env

2. Navigate to the `frontend/` directory and create the frontend environment file.
     cp frontend/.env.example frontend/.env

3. Ensure the frontend config `frontend/.env` points to the local backend properly:
     VITE_API_ROOT=http://localhost:5009

### Database Configuration (MongoDB)
If you have Docker installed, the easiest way to start MongoDB is by running:
     docker compose up -d mongo

Alternatively, if you already have a local MongoDB daemon installed and running on port 27017, no additional steps correspond to the database setup. Just ensure that the `MONGO_URI` in the root `.env` file matches your local database instance (e.g., `mongodb://localhost:27017/edu_platform`).

---

## 3. Running the Application Locally (Development Mode)

You will need two terminal windows: one to run the backend server and another to build and serve the frontend web application.

### A) Start the Backend Server
Open a terminal at the project root and run the following commands:
1. Create a Python Virtual Environment:
     python -m venv backend/venv

2. Activate the Virtual Environment:
     # For macOS and Linux:
     source backend/venv/bin/activate
     
     # For Windows:
     backend\venv\Scripts\activate

3. Install the Required Python Dependencies:
     pip install -r backend/requirements.txt

4. Start the Application:
     python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5009

The backend will start and listen on port 5009. You can verify it's running by navigating to: http://localhost:5009/api/health

### B) Start the Frontend Client
Open a second terminal, navigate to the `frontend` folder, and run:
1. Move to the frontend directory:
     cd frontend

2. Install Node dependencies:
     npm install

3. Start the Vite development server:
     npm run dev

The web interface will automatically be hosted and served. Open your web browser and navigate to the local address provided by Vite (usually http://localhost:5173).

---

## 4. Running via Docker (Production Simulation)

If you prefer to run the entire stack (Frontend, Backend, and MongoDB) via Docker containers, you can use the provided Docker Compose configuration.

1. Setup the required Docker environment files first:
     cp backend/.env.production backend/.env
     cp frontend/.env.production frontend/.env

2. Build and start the containers in detached mode:
     docker compose up --build -d

3. The application is now served behind an Nginx proxy. You can access the main frontend UI locally by navigating to: `http://localhost`

## 5. Notes on the Video & Slide Generation Module
The application automatically generates educational videos out of slides by leveraging Playwright to take screenshots of the rendered React components, ensuring the final video visually matches the browser preview exactly.

**Local Development:**
Before triggering a video generation, ensure the frontend is running (`npm run dev`). Playwright will connect to:
`http://127.0.0.1:5173/slide-renderer`

**Production Environment:**
Configure the `SLIDE_RENDERER_URL` environment variable on the backend to point to the built frontend service:
```env
SLIDE_RENDERER_URL=http://frontend:4173/slide-renderer
```
When deploying using Docker Compose, the `frontend` service runs `vite preview` and this is handled automatically.

**Automatic Fallback:**
If the frontend service is unreachable, the backend will automatically fallback to Pillow-based static image rendering.

---

## 6. Troubleshooting FAQs

- **Frontend cannot connect to the backend:**
  Verify the value of `VITE_API_ROOT` in the `frontend/.env` file. It should match your backend server address.

- **Backend cannot connect to the database:**
  Verify the `MONGO_URI` in the `.env` file and ensure your MongoDB instance or Docker container is running properly.

- **AI functionalities are failing:**
  Double-check the `.env` file to ensure API keys and tokens for all AI providers are correctly configured.

- **Generated video slides look different from the browser preview:**
  Ensure the frontend service is actively running and the backend can successfully reach the `SLIDE_RENDERER_URL`.
