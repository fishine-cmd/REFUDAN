@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title RE:FUDAN 一键启动

echo.
echo ========================================
echo   RE:FUDAN  一键启动
echo ========================================
echo.

REM ================================================================
REM [1/6] Bun
REM ================================================================
echo [1/6] 正在检查 Bun...
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo   ^> Bun 未安装,正在自动下载...
    echo   ^> 这一步可能需要 30-60 秒,请耐心等待
    powershell -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    where bun >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo [错误] Bun 自动安装失败
        echo   可能原因:网络不通 / PowerShell 执行策略被限制
        echo   手动方案:访问 https://bun.sh 下载安装,然后重新双击本脚本
        echo.
        pause
        exit /b 1
    )
    echo   ^> Bun 已安装
) else (
    echo   ^> Bun 已就绪
)

REM ================================================================
REM [2/6] 前端依赖
REM ================================================================
echo.
echo [2/6] 正在检查前端依赖...
if not exist "apps\site\node_modules\next" (
    echo   ^> 缺少依赖,正在安装,首次约 1-2 分钟...
    bun install
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 前端依赖安装失败
        echo   建议:检查网络后重试;或在本目录手动跑 bun install
        echo.
        pause
        exit /b 1
    )
    echo   ^> 前端依赖已就绪
) else (
    echo   ^> 前端依赖已就绪
)

REM ================================================================
REM [3/6] Python
REM ================================================================
echo.
echo [3/6] 正在检查 Python...
python -V >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [错误] 未检测到 Python
    echo   社媒提取功能需要 Python 3.12+
    echo   请到 https://www.python.org/downloads/ 下载安装
    echo   安装时勾选 "Add Python to PATH",然后重新双击本脚本
    echo.
    pause
    exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [错误] Python 版本过低,需要 3.12+
    python -V
    echo   请到 https://www.python.org/downloads/ 升级
    echo.
    pause
    exit /b 1
)
echo   ^> Python 已就绪

REM ================================================================
REM [4/6] Python 依赖
REM ================================================================
echo.
echo [4/6] 正在检查 Python 依赖...
python -c "import faiss, requests, pydantic, numpy, playwright" >nul 2>&1
if !errorlevel! neq 0 (
    echo   ^> 缺少 Python 依赖,正在安装...
    python -m pip install --quiet -r services\profile-extraction\requirements.txt
    if !errorlevel! neq 0 (
        echo.
        echo [警告] Python 依赖安装失败
        echo   GitHub 提取仍可走 REST,但 XHS 等需要 Playwright 的链路会不可用
        echo   手动方案:cd services\profile-extraction ^&^& pip install -r requirements.txt
        echo.
        echo   按任意键继续,跳过此步...
        pause >nul
    ) else (
        echo   ^> Python 依赖已就绪
    )
) else (
    echo   ^> Python 依赖已就绪
)

REM ================================================================
REM [5/6] Playwright Chromium
REM ================================================================
echo.
echo [5/6] 正在检查 Playwright Chromium...
python -c "from playwright.sync_api import sync_playwright; import pathlib; p=sync_playwright().start(); ok=pathlib.Path(p.chromium.executable_path).exists(); p.stop(); exit(0 if ok else 1)" >nul 2>&1
if !errorlevel! neq 0 (
    echo   ^> Chromium 未装,正在下载,约 150MB,可能需要 1-3 分钟...
    python -m playwright install chromium
    if !errorlevel! neq 0 (
        echo.
        echo [警告] Chromium 下载失败
        echo   GitHub 提取走 REST 不受影响,XHS 提取将不可用
        echo   手动方案:python -m playwright install chromium
        echo.
        echo   按任意键继续...
        pause >nul
    ) else (
        echo   ^> Chromium 已就绪
    )
) else (
    echo   ^> Chromium 已就绪
)

REM ================================================================
REM [6/6] 起前端
REM ================================================================
echo.
echo [6/6] 正在启动 site 端口 3000 和 app 端口 3001...
start "RE:FUDAN site (3000)" cmd /k "cd /d %~dp0apps\site && bun run dev"
start "RE:FUDAN app (3001)" cmd /k "cd /d %~dp0apps\app && bun run dev"

echo.
echo 等待 6 秒后打开浏览器...
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo ========================================
echo   应用已启动
echo ========================================
echo.
echo   site: http://localhost:3000
echo   app : http://localhost:3001
echo.
echo   XHS 首次使用需要登录:
echo   双击 services\profile-extraction\xhs_login.bat
echo.
echo   停止方法:关掉那两个标题为
echo            "RE:FUDAN site (3000)" 和 "RE:FUDAN app (3001)"
echo            的黑窗口即可
echo.
echo   按任意键关闭本窗口,不影响已启动的应用
pause >nul
endlocal
exit /b 0
