# Intelligent Edu Platform

## Project Overview
Intelligent Edu Platform is a comprehensive, full-stack educational system designed to provide AI-powered learning assistance. The platform integrates a Retrieval-Augmented Generation (RAG) educational chatbot, a document-based knowledge indexing system, an AI grading workbench, and capabilities for automated slide and lecture video generation.

## Technical Architecure
- **Backend:** FastAPI, Python 3.11 / 3.12, MongoDB (Motor), ChromaDB, LangChain.
- **Frontend:** React 18, TypeScript, Vite, Zustand.
- **Deployment:** Docker Compose, Nginx.

---

## 1. Prerequisites
Before starting, ensure the following tools are installed on your machine:
- **Python 3.11 or 3.12** *(⚠️ Important: Do not use Python 3.13 as some machine learning dependencies like `shapely` lack precompiled wheels and will fail to build).*
- **Node.js 18 or greater** (LTS recommended)
- **npm** (Node Package Manager)
- **MongoDB 7.0+** (running locally at `mongodb://localhost:27017` or via Docker)

---

## 2. Project Setup & Configuration

### Environment Variables
You need to set up environment variables for both the backend and frontend.

1. **Backend Config:**
   At the root of the project, create the main `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
   *Open `.env` and fill in your API keys (e.g., Coze / Local Ollama URLs, Google OAuth endpoints, etc.).*

2. **Frontend Config:**
   Navigate to the `frontend/` directory and do the same:
   ```bash
   cd frontend
   cp .env.example .env
   cd ..
   ```
   *Ensure the `frontend/.env` points to the local backend API (default is usually `VITE_API_ROOT=http://localhost:5009`).*

### Database Configuration (MongoDB)
If you have Docker installed, you can simply spin up a MongoDB instance using:
```bash
docker compose up -d mongo
```
*(If you are running MongoDB locally without Docker, just make sure `MONGO_URI` in the root `.env` matches your address, e.g., `mongodb://localhost:27017/edu_platform`).*

### AI Provider Configuration (Local Ollama on Windows)
If you are deploying a local Large Language Model via Ollama on a **separate Windows machine**, you must configure Windows to allow local network access, and subsequently update the backend configuration.

1. **Allow External Access to Ollama (Windows)**:
   By default, Ollama only listens to `localhost`. To let your macOS backend connect to it:
   - Right-click the **Ollama icon** in the Windows taskbar tray and choose **Quit Ollama**.
   - Press `Win + R`, type `sysdm.cpl`, hit Enter, then switch to the **Advanced** tab and click **Environment Variables**.
   - Under "System variables" or "User variables", click **New**:
     - **Variable name**: `OLLAMA_HOST`
     - **Variable value**: `0.0.0.0`
   - Click **OK** to save. Restart Ollama. It will now accept connections from other computers on your local network.

2. **Retrieve Windows IP Address**:
   - Open Command Prompt on Windows (`cmd`), run `ipconfig`, and take note of the **IPv4 Address** (e.g., `192.168.1.100`).

3. **Update Backend Configuration**:
   - Open the `backend/core/config.py` file in this project.
   - Around line 78, change the `OLLAMA_BASE_URL` to point to your Windows IP address:
```python
# backend/core/config.py
OLLAMA_BASE_URL: str = "http://<YOUR_WINDOWS_IPv4_ADDRESS>:11434"
```
   *(Wait for the backend server to restart, or manually restart it for changes to apply).*

---

## 3. Running the Application Locally (Development Mode)

You will need **two terminal windows**: one for the backend server and another for the frontend web application.

### A) Start the Backend Server (Terminal 1)
Open a terminal at the project root and run the following commands:

1. **Create a Python Virtual Environment**:
   ```bash
   python -m venv backend/venv
   ```

2. **Activate the Virtual Environment**:
   - For macOS and Linux:
     ```bash
     source backend/venv/bin/activate
     ```
   - For Windows:
     ```bash
     backend\venv\Scripts\activate
     ```

3. **Install Python Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Start the Application**:
   ```bash
   python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 5009
   ```
   *The backend is now running at `http://localhost:5009`. You can verify by visiting: `http://localhost:5009/api/health`*

### B) Start the Frontend Client (Terminal 2)
Open a second terminal at the project root and run:

1. **Move to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   *The web interface will be served at `http://localhost:5173`. Open this URL in your browser.*

---

## 4. Running via Docker (Production Simulation)

If you prefer to run the entire stack (Frontend, Backend, MongoDB) via Docker, use the provided Docker Compose configuration.

1. **Setup Production Environment Files**:
   ```bash
   cp backend/.env.production backend/.env
   cp frontend/.env.production frontend/.env
   ```

2. **Build and start the containers**:
   ```bash
   docker compose up --build -d
   ```

3. Access the main UI locally by navigating to: `http://localhost`

---

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

- **"Building wheel for accumulation-tree ... error" during `pip install`**:
  You are likely using Python 3.13. Please downgrade to Python 3.11 or 3.12, delete the `backend/venv` folder, and recreate the virtual environment.
- **Frontend cannot connect to the backend**:
  Verify the value of `VITE_API_ROOT` in the `frontend/.env` file. It should properly point to your backend server address (e.g., `http://localhost:5009`).
- **Backend cannot connect to the database**:
  Verify the `MONGO_URI` in the `.env` file and ensure your MongoDB instance or Docker container is running properly.
- **AI functionalities are failing**:
  Double-check the `backend/core/config.py` and `.env` file to ensure API keys (`COZE_API_KEY`) and URLs (`OLLAMA_BASE_URL`) for your chosen AI providers are correctly configured.
- **Generated video slides look different from the browser preview**:
  Ensure the frontend service is actively running and the backend can successfully reach the `SLIDE_RENDERER_URL`.
