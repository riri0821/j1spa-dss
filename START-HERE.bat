@echo off
REM ==== J1SPA DSS launcher - just double-click this file ====
cd /d "%~dp0"
title J1SPA DSS server
echo.
echo   Starting the J1SPA Analytics and DSS web app...
echo.
echo   When it says "Running on http://127.0.0.1:5000",
echo   open that address in your web browser.
echo.
echo   Logins:  owner / owner123      (full access)
echo            staff1 / staff123     (sales + stock-in only)
echo.
echo   To STOP the server: click this window and press  Ctrl + C,
echo   or just close the window.
echo.
echo ------------------------------------------------------------
echo.
".venv\Scripts\python.exe" run.py
echo.
echo   Server stopped.
pause
