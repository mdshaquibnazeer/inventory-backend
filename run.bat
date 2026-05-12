@echo off
title RetailOS - Inventory System
echo.
echo  ========================================
echo   RetailOS - Inventory Management System
echo  ========================================
echo.
echo  Starting services...
echo.

cd /d "%~dp0"

echo  [1/3] Starting Database...
docker-compose up -d db redis
echo.

echo  [2/3] Starting Backend Server...
start /B node backend\src\server.js

echo  [3/3] Waiting for server...
timeout /t 5 /nobreak >nul

echo.
echo  Opening app in browser...
start "" "%~dp0index.html"

echo.
echo  =========================================
echo   RetailOS is running!
echo   Backend:  http://localhost:5000
echo   Login:    admin@inventory.com / Admin@123
echo  =========================================
echo.
echo  Press any key to STOP the server...
pause >nul

taskkill /f /im node.exe >nul 2>&1
echo  Server stopped. Goodbye!
