@echo off
setlocal

cd /d "%~dp0"

set "NODE_DIR=%CD%\.tools\node"
set "NPM_CACHE=%CD%\.npm-cache"

if not exist "%NODE_DIR%\node.exe" (
  echo [KovaakTracker] Portable Node was not found.
  echo Expected: "%NODE_DIR%\node.exe"
  echo.
  echo Please install the project-local Node runtime first.
  pause
  exit /b 1
)

if not exist "%NODE_DIR%\npm.cmd" (
  echo [KovaakTracker] npm.cmd was not found.
  echo Expected: "%NODE_DIR%\npm.cmd"
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
set "npm_config_cache=%NPM_CACHE%"

if /i "%~1"=="--check" (
  "%NODE_DIR%\node.exe" -v
  call "%NODE_DIR%\npm.cmd" -v
  exit /b %ERRORLEVEL%
)

echo [KovaakTracker] Starting React/Vite dev server...
echo [KovaakTracker] URL: http://127.0.0.1:5173/react.html
echo [KovaakTracker] Press Ctrl+C in this window to stop.
echo.

start "" "http://127.0.0.1:5173/react.html"
call "%NODE_DIR%\npm.cmd" run dev -- --host 127.0.0.1 --port 5173

echo.
echo [KovaakTracker] Dev server stopped.
pause
