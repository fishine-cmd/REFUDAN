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
python -c "import faiss, requests, pydantic, numpy" >nul 2>&1
if !errorlevel! neq 0 (
    echo   ^> 缺少 Python 依赖,正在安装...
    python -m pip install --quiet -r services\profile-extraction\requirements.txt
    if !errorlevel! neq 0 (
        echo.
        echo [警告] Python 依赖安装失败
        echo   GitHub 提取仍可走 REST,但 XHS/知乎/LinkedIn 等 CDP 链路会不可用
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
REM [5/6] Edge CDP
REM ================================================================
echo.
echo [5/6] 正在检查 Edge CDP 远程调试...
netstat -an | findstr ":3456 " >nul 2>&1
if %errorlevel% equ 0 (
    echo   ^> 端口 3456 已被占用,假定 Edge CDP 已运行
) else (
    set "EDGE_PATH="
    if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    if defined EDGE_PATH (
        echo   ^> 正在启动 Edge 远程调试,独立 user-data-dir 不影响日常 Edge
        start "Edge CDP (3456)" "!EDGE_PATH!" --remote-debugging-port=3456 --user-data-dir="%USERPROFILE%\.edge-cdp-profile"
        echo   ^> 已启动
    ) else (
        echo   ^> 未找到 Edge 浏览器,跳过 CDP 启动
        echo   ^> GitHub 走 REST 不受影响,XHS/知乎/LinkedIn 提取将不可用
    )
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
echo   Edge CDP: localhost:3456
echo.
echo   停止方法:关掉
echo            "RE:FUDAN site (3000)"
echo            "RE:FUDAN app (3001)"
echo            "Edge CDP (3456)" 的 Edge 窗口
echo            这三个窗口即可
echo.
echo   按任意键关闭本窗口,不影响已启动的应用
pause >nul
endlocal
exit /b 0
