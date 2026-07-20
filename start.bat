@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Shiv Shakti Library - Library Cabin System
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer.
  echo Please install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo.
  echo [Setup needed] backend\.env is missing.
  echo Copy backend\.env.example to backend\.env and fill in your
  echo DATABASE_URL and JWT secrets, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing launcher dependencies...
  call npm install
)

if not exist "backend\node_modules" (
  echo Installing backend dependencies...
  call npm install --prefix backend
)

if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  call npm install --prefix frontend
)

echo.
echo Running database migrations...
call npm run migrate

echo.
echo Starting the app. This window must stay open while you use the system.
echo Once it says "ready", open http://localhost:5173 in your browser.
echo.

start "" http://localhost:5173
call npm run dev

pause
