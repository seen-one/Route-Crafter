@echo off
echo ========================================
echo Route-Crafter Installation/Update
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/downloads/windows/
    echo Make sure to tick 'Add Python.exe to PATH' during installation
    echo.
    pause
    exit /b 1
)

echo Python found:
python --version
echo.

REM Check if Git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed
    echo Please install Git from https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo Git found:
git --version
echo.

REM Check if we're in the right directory (look for app.py)
if not exist "app.py" (
    echo ERROR: app.py not found in current directory
    echo Please run this script from the Route-Crafter directory
    echo.
    pause
    exit /b 1
)

echo Route-Crafter directory found!
echo.

REM Create virtual environment if it doesn't exist
if not exist "env" (
    echo Creating virtual environment...
    python -m venv env
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment created successfully!
) else (
    echo Virtual environment already exists
)

echo.
echo Activating virtual environment...
call .\env\Scripts\activate
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

echo.
echo Installing/updating dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation/Update complete!
echo ========================================
echo.
echo You can now run start_server.bat to start the server
echo.
pause
