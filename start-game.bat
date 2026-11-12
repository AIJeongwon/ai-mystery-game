@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo [setup] npm install ...
  call npm install --no-fund --no-audit
)
start "" http://localhost:5173
node server/index.js
pause
