@echo off
setlocal
cd /d "%~dp0"

title XHS 登录

echo.
echo ========================================
echo   XHS 小红书 一次性登录
echo ========================================
echo.
echo 这一步只需做一次。完成后,后续抓取自动复用登录态。
echo.
echo 流程:
echo   1. 自动打开 Chromium 浏览器
echo   2. 在打开的窗口里扫码或输入账号密码登录
echo   3. 完成登录后,回到本窗口按 Enter
echo   4. cookie 自动保存到 data\browser_profile\
echo.
echo --------- Python 输出开始 ---------
echo.

python run_pipeline.py --xhs-login

echo.
echo --------- Python 输出结束 ---------
echo.
pause
endlocal
exit /b 0
