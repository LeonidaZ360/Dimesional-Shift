@echo off
TITLE Vid2Splat - Frontend Launcher

echo ===================================================
echo           Starting Site
echo ===================================================
echo.

:: Set working directory to the script's folder



:: Launch React Frontend (Vite)
echo [2/2] Launching React Frontend...


if exist "C:\Users\Leonard\Desktop\frontend" (
   cd C:\Users\Leonard\Desktop\frontend\src 
   call npm run dev -- --host
) else (
    echo [ERROR] Could not find 'frontend' folder in C:\Users\Leonard\Desktop\frontend
)

PAUSE