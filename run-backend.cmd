@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\venv\Scripts\python.exe" (
  echo [ERROR] backend\venv\Scripts\python.exe not found.
  echo Recreate venv first: python -m venv backend\venv
  exit /b 1
)
call "backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
