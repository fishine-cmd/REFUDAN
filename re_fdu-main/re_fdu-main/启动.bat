@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title RE:FUDAN 一键启动

echo.
echo ========================================
echo   RE:FUDAN  一键启动
echo ========================================
echo.

echo [1/4] 正在检查 Bun...
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

echo.
echo [2/4] 正在检查依赖...
if not exist "apps\site\node_modules\next" (
    echo   ^> 缺少依赖,正在安装,首次约 1-2 分钟...
    bun install
    if !errorlevel! neq 0 (
        echo.
        echo [错误] 依赖安装失败
        echo   建议:检查网络后重试;或在本目录手动跑 bun install
        echo.
        pause
        exit /b 1
    )
    echo   ^> 依赖已就绪
) else (
    echo   ^> 依赖已就绪
)

echo.
echo [3/4] 正在启动 site 端口 3000 和 app 端口 3001...
start "RE:FUDAN site (3000)" cmd /k "cd /d %~dp0apps\site && bun run dev"
start "RE:FUDAN app (3001)" cmd /k "cd /d %~dp0apps\app && bun run dev"

echo.
echo [4/4] 等待 6 秒后打开浏览器...
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
echo   停止方法:关掉那两个标题为
echo            "RE:FUDAN site (3000)" 和 "RE:FUDAN app (3001)"
echo            的黑窗口即可
echo.
echo   按任意键关闭本窗口,不影响已启动的应用
pause >nul
endlocal
exit /b 0
