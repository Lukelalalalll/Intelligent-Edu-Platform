@echo off
setlocal
set "NODEJS=C:\Program Files\nodejs"
if not exist "%NODEJS%\node.exe" (
  echo [ERROR] Node.js not found at %NODEJS%
  echo Please reinstall Node.js LTS to default path.
  exit /b 1
)
set "PATH=%NODEJS%;%PATH%"
cd /d "%~dp0frontend"
call "%NODEJS%\npm.cmd" run dev
