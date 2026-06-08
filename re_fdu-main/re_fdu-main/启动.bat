@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title RE:FUDAN Launcher

echo.
echo ========================================
echo   RE:FUDAN Launcher
echo ========================================
echo.

REM ================================================================
REM [1/7] Bun
REM ================================================================
echo [1/7] Checking Bun...
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo   ^> Bun not found. Installing automatically...
    echo   ^> This may take 30-60 seconds.
    powershell -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    where bun >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Bun installation failed.
        echo   Visit https://bun.sh and install Bun manually, then run this script again.
        echo.
        pause
        exit /b 1
    )
    echo   ^> Bun is ready.
) else (
    echo   ^> Bun is ready.
)

REM ================================================================
REM [2/7] Frontend dependencies
REM ================================================================
echo.
echo [2/7] Checking frontend dependencies...
if not exist "apps\site\node_modules\next" (
    echo   ^> Missing dependencies. Running bun install...
    bun install
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Frontend dependency installation failed.
        echo   Please check your network, then run bun install manually if needed.
        echo.
        pause
        exit /b 1
    )
    echo   ^> Frontend dependencies are ready.
) else (
    echo   ^> Frontend dependencies are ready.
)

REM ================================================================
REM [3/7] Python
REM ================================================================
echo.
echo [3/7] Checking Python...
python -V >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python was not found.
    echo   Social extraction requires Python 3.12+.
    echo   Download it from https://www.python.org/downloads/
    echo   Make sure "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Python 3.12+ is required.
    python -V
    echo.
    pause
    exit /b 1
)
echo   ^> Python is ready.

REM ================================================================
REM [4/7] Python dependencies
REM ================================================================
echo.
echo [4/7] Checking Python dependencies...
python -c "import faiss, requests, pydantic, numpy, playwright" >nul 2>&1
if !errorlevel! neq 0 (
    echo   ^> Missing Python dependencies. Installing...
    python -m pip install --quiet -r services\profile-extraction\requirements.txt
    if !errorlevel! neq 0 (
        echo.
        echo [WARN] Python dependency installation failed.
        echo   XHS extraction may be unavailable until dependencies are installed.
        echo   Manual command:
        echo   cd services\profile-extraction ^&^& pip install -r requirements.txt
        echo.
        echo   Press any key to continue...
        pause >nul
    ) else (
        echo   ^> Python dependencies are ready.
    )
) else (
    echo   ^> Python dependencies are ready.
)

REM ================================================================
REM [5/7] Playwright Chromium
REM ================================================================
echo.
echo [5/7] Checking Playwright Chromium...
python -c "from playwright.sync_api import sync_playwright; import pathlib; p=sync_playwright().start(); ok=pathlib.Path(p.chromium.executable_path).exists(); p.stop(); exit(0 if ok else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo   ^> Chromium not found. Downloading now...
    python -m playwright install chromium
    if !errorlevel! neq 0 (
        echo.
        echo [WARN] Chromium download failed.
        echo   XHS extraction may be unavailable.
        echo   Manual command: python -m playwright install chromium
        echo.
        echo   Press any key to continue...
        pause >nul
    ) else (
        echo   ^> Chromium is ready.
    )
) else (
    echo   ^> Chromium is ready.
)

REM ================================================================
REM [6/7] Optional XHS Chrome login
REM ================================================================
echo.
echo [6/7] Open Xiaohongshu in Chrome now?
echo   Y = open a separate window and run services\profile-extraction\xhs_login.py
echo   N = skip for now
choice /c YN /n /m "Enter Y or N: "
if errorlevel 2 (
    echo   ^> Skipped XHS Chrome login.
) else (
    echo   ^> Opening XHS Chrome login window...
    start "XHS Login (Chrome + CDP)" cmd /k "cd /d %~dp0services\profile-extraction && python xhs_login.py"
)

REM ================================================================
REM [7/7] Start apps
REM ================================================================
echo.
echo [7/7] Starting site on :3000 and app on :3001...
start "RE:FUDAN site (3000)" cmd /k "cd /d %~dp0apps\site && bun run dev"
start "RE:FUDAN app (3001)" cmd /k "cd /d %~dp0apps\app && bun run dev"

echo.
echo Waiting 6 seconds before opening the browser...
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo ========================================
echo   Apps started
echo ========================================
echo.
echo   site: http://localhost:3000
echo   app : http://localhost:3001
echo.
echo   For XHS login, you can:
echo   1. Choose Y in this launcher
echo   2. Or run services\profile-extraction\xhs_login.bat later

echo   To stop the apps, close the two windows named:
echo   "RE:FUDAN site (3000)" and "RE:FUDAN app (3001)"
echo.
echo   Press any key to close this window.
pause >nul
endlocal
exit /b 0