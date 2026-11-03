@echo off
TITLE Vid2Splat - Server Launcher

echo ===================================================
echo           Starting Server
echo ===================================================
echo.

:: Set working directory to the script's folder
cd C:\Users\Leonard\Desktop\frontend

:: 1. Launch FastAPI Backend (Conda nerfstudio env + Uvicorn)
echo [1/2] Launching FastAPI Backend

call conda activate nerfstudio 

call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64

uvicorn api:app --host 0.0.0.0 --port 8000 --reload

PAUSE