@echo off
setlocal

cd /d "%~dp0"

set "NODE_DIR=%CD%\.tools\node"
set "NPM_CACHE=%CD%\.npm-cache"
set "CARGO_DIR=%USERPROFILE%\.cargo\bin"

if not exist "%NODE_DIR%\npm.cmd" (
  echo [KovaakTracker] Portable Node was not found.
  echo Expected: "%NODE_DIR%\npm.cmd"
  pause
  exit /b 1
)

if not exist "%CARGO_DIR%\cargo.exe" (
  echo [KovaakTracker] Rust was not found.
  echo Expected: "%CARGO_DIR%\cargo.exe"
  echo Install Rust from https://rustup.rs and the Visual Studio C++ build tools.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%CARGO_DIR%;%PATH%"
set "npm_config_cache=%NPM_CACHE%"

echo [KovaakTracker] Starting the desktop app in development mode...
echo [KovaakTracker] The first run compiles the Rust side and takes a few minutes.
echo [KovaakTracker] Press Ctrl+C in this window to stop.
echo.

call "%NODE_DIR%\npm.cmd" run tauri dev

echo.
echo [KovaakTracker] Desktop app stopped.
pause
