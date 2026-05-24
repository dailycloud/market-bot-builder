@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set PYTHON_EXE=
if exist ".venv\Scripts\python.exe" set PYTHON_EXE=.venv\Scripts\python.exe
if "%PYTHON_EXE%"=="" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python is not installed or not in PATH.
    echo Install Python 3.11+ and re-run.
    goto :end
  )
  echo Creating venv...
  python -m venv .venv
  set PYTHON_EXE=.venv\Scripts\python.exe
)

if not exist ".venv\Scripts\pip.exe" (
  echo Pip not found in venv.
  goto :end
)

echo Installing dependencies...
".venv\Scripts\pip.exe" install -r requirements.txt

if "%BOT_TOKEN%"=="" if exist ".env" (
  for /f "usebackq tokens=1* delims==" %%A in (`findstr /i "^BOT_TOKEN=" ".env"`) do set BOT_TOKEN=%%B
)

if "%BOT_TOKEN%"=="" (
  echo BOT_TOKEN is not set.
  echo Set it for this session:
  echo   set BOT_TOKEN=YOUR_TOKEN
  echo Or create .env with a line like:
  echo   BOT_TOKEN=YOUR_TOKEN
  goto :end
)

"%PYTHON_EXE%" "bot\main.py"

:end
echo.
echo Press any key to close this window.
pause >nul
endlocal
