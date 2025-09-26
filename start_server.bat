@echo off
echo ========================================
echo Route-Crafter Server Startup
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "env" (
    echo ERROR: Virtual environment not found!
    echo Please run update.bat first to install/update the environment
    echo.
    pause
    exit /b 1
)

REM Check if requirements are installed by looking for a key package
call .\env\Scripts\activate
python -c "import flask" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Dependencies not installed!
    echo Please run update.bat first to install/update dependencies
    echo.
    pause
    exit /b 1
)

echo Activating virtual environment...
call .\env\Scripts\activate
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

echo.
echo Starting Flask application...
echo The server will be accessible at http://localhost:5000/
echo Press Ctrl+C to stop the server
echo.

python app.py

echo.
echo Server stopped.
pause
