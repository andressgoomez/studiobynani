@echo off
title StudioByNani
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = 3000,5173,5174; foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

call npm run dev
pause
