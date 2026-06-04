@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo [출입 관리 시스템] 시작 중...

if not exist node_modules (
  echo 패키지 설치 중 (최초 1회)...
  npm install
)

echo 개발 서버 시작...
start "" http://localhost:3000
npm run dev
