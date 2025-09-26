#!/bin/bash

echo "========================================"
echo "Route-Crafter Server Startup"
echo "========================================"
echo

# Check if virtual environment exists
if [ ! -d "env" ]; then
    echo "ERROR: Virtual environment not found!"
    echo "Please run ./update.sh first to install/update the environment"
    echo
    exit 1
fi

# Check if requirements are installed by looking for a key package
source env/bin/activate
python -c "import flask" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Dependencies not installed!"
    echo "Please run ./update.sh first to install/update dependencies"
    echo
    exit 1
fi

echo "Activating virtual environment..."
source env/bin/activate
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to activate virtual environment"
    exit 1
fi

echo
echo "Starting Flask application..."
echo "The server will be accessible at http://localhost:5000/"
echo "Press Ctrl+C to stop the server"
echo

python app.py

echo
echo "Server stopped."
