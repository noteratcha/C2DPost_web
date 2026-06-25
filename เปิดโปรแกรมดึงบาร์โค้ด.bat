@echo off
title Barcode Generator Server
echo ===================================================
echo   Starting Barcode Generator System...
echo ===================================================
echo.
echo Please DO NOT close this window while using the website.
echo You can minimize this window.
echo.

:: Start the node server
start /b node server.js

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open default web browser to the local site
start http://localhost:3000

echo.
echo Server is running! 
echo If the website didn't open automatically, please go to:
echo http://localhost:3000
echo.
pause
