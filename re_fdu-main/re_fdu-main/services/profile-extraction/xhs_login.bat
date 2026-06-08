@echo off
setlocal
cd /d "%~dp0"

title XHS Login

echo.
echo ========================================
echo   XHS Xiaohongshu Chrome/CDP Login
echo ========================================
echo.
echo This step usually only needs to be done once.
echo Later collections will reuse the same real Chrome profile.
echo.
echo Flow:
echo   1. Open a real Chrome window with CDP enabled
echo   2. Finish login / QR scan / captcha on the Xiaohongshu homepage
echo   3. The script verifies homepage UI, cookie, and login state first
echo   4. Real profile collection only starts after login is confirmed
echo.
echo --------- Python output begins ---------
echo.

python xhs_login.py

echo.
echo --------- Python output ends ---------
echo.
pause
endlocal
exit /b 0
