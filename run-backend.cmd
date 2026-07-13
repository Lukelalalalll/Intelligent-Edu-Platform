@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\venv\Scripts\python.exe" (
  echo [ERROR] backend\venv\Scripts\python.exe not found.
  echo Recreate venv first: python -m venv backend\venv
  exit /b 1
)

if not defined JAVA_HOME (
  if exist "D:\Java\jdk21\bin\java.exe" set "JAVA_HOME=D:\Java\jdk21"
)
if defined JAVA_HOME (
  if exist "%JAVA_HOME%\bin\java.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
)
where java >nul 2>nul
if errorlevel 1 (
  echo [WARN] java not found in PATH. OpenDataLoader PDF parsing will fall back.
) else (
  echo [INFO] java found:
  where java
)

set "BACKEND_PORT=5009"
set "UVICORN_RELOAD="
if /I "%BACKEND_RELOAD%"=="1" set "UVICORN_RELOAD=--reload"

echo [INFO] backend port: %BACKEND_PORT%
if defined UVICORN_RELOAD echo [INFO] uvicorn reload enabled

call "backend\venv\Scripts\python.exe" -m uvicorn backend.main:app %UVICORN_RELOAD% --host 127.0.0.1 --port %BACKEND_PORT%
