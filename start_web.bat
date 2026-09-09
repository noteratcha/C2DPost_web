@echo off
chcp 65001 > nul
title C2DPost Web Launcher
echo ========================================================
echo       C2DPost Web Edition (Local Server Launcher)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] ตรวจสอบ Node Modules...
if not exist "node_modules\" (
    echo กำลังติดตั้ง npm dependencies...
    call npm install
)

echo.
echo [2/3] กำลังเริ่มทำงาน Backend API (FastAPI Port 8000)...
start "C2DPost Backend API" cmd /k "cd /d ""%~dp0api"" && python -m uvicorn index:app --host 127.0.0.1 --port 8000 --reload"

echo.
echo [3/3] กำลังเริ่มทำงาน Frontend Web (Vite Port 5173)...
start "C2DPost Web UI" cmd /k "npm run dev"

echo.
echo รันระบบสำเร็จ! กำลังเปิดเบราว์เซอร์...
timeout /t 3 > nul
start http://localhost:5173

echo.
echo ********************************************************
echo  อย่าลืมติดตั้งส่วนขยาย Chrome Extension จากโฟลเดอร์ extension/
echo  หากยังไม่ได้ติดตั้ง หน้าเว็บจะมีปุ่มให้ดาวน์โหลดและคู่มือ 3 สเต็ป
echo ********************************************************
echo.
pause
