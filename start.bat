@echo off
title Trend Detector — NASA Earth System Trend Detective
echo ========================================================
echo   Starting Trend Detector (NASA Space Apps 2026)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Checking Python FastAPI backend...
start "Trend Detector Backend (FastAPI)" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend UI Server...
start "Trend Detector Frontend (Node.js)" cmd /k "cd frontend && node server.js"

timeout /t 2 /nobreak >nul

echo.
echo ========================================================
echo   Application running at: http://localhost:5173/
echo   FastAPI backend at:      http://localhost:8000/
echo   API Documentation:       http://localhost:8000/docs
echo ========================================================
echo.
start http://localhost:5173/
