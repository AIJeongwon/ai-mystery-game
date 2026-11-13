@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 기정사실 - 공유 중 (이 창을 닫으면 공유가 끝납니다)
if not exist node_modules (
  echo [setup] npm install ...
  call npm install --no-fund --no-audit
)
node tools/share.mjs
pause
