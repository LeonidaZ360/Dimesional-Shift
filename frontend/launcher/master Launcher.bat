@echo off
TITLE Vid2Splat - Server & Frontend Launcher

echo ===================================================
echo           Starting Vid2Splat System
echo ===================================================
echo.
echo.
echo.

::prepare environnment

ECHO preparing environment

set "ENV_FILE=C:\Users\Leonard\Desktop\frontend\.env"

for /f "usebackq" %%a in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "IP=%%a"

if not defined IP (
    echo Could not detect IP. Are you connected to a network?
    pause
    exit /b 1
)

>"%ENV_FILE%" echo VITE_API_URL=http://%IP%:8000
echo Wrote VITE_API_URL=http://%IP%:8000 to %ENV_FILE%

timeout /t 2

echo.
echo.
echo =================================================
echo DONE
echo ===================================================
echo.


cd C:\Users\Leonard\Desktop\frontend
echo.
echo.
echo ===================================================
ECHO starting backend
echo ===================================================
echo.
echo.

start "Dimensional Shift Backend" cmd /k "C:\Users\Leonard\Desktop\frontend\launcher\server_start.bat"

REM
timeout /t 8
echo.
echo.
echo ===================================================
ECHO starting frontend
echo ==================================================
echo.
echo.

start "Dimensional Shift Frontend" cmd /k "C:\Users\Leonard\Desktop\frontend\launcher\frontend_start.bat"

echo.
echo ===================================================
echo Both servers are launching in separate windows!
echo  - Backend API: http://%IP%:8000
echo  - Frontend UI: http://localhost:5173
echo ===================================================
echo.
timeout /t 5
PAUSE