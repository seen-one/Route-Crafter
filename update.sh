#!/bin/bash

echo "========================================"
echo "Route-Crafter Installation/Update"
echo "========================================"
echo

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed"
    echo "Please install Python3 using your package manager:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "  CentOS/RHEL: sudo yum install python3 python3-pip"
    echo "  Fedora: sudo dnf install python3 python3-pip"
    echo
    exit 1
fi

echo "Python3 found:"
python3 --version
echo

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "ERROR: Git is not installed"
    echo "Please install Git using your package manager:"
    echo "  Ubuntu/Debian: sudo apt install git"
    echo "  CentOS/RHEL: sudo yum install git"
    echo "  Fedora: sudo dnf install git"
    echo
    exit 1
fi

echo "Git found:"
git --version
echo

# Check if we're in the right directory (look for app.py)
if [ ! -f "app.py" ]; then
    echo "ERROR: app.py not found in current directory"
    echo "Please run this script from the Route-Crafter directory"
    echo
    exit 1
fi

echo "Route-Crafter directory found!"
echo

# Create virtual environment if it doesn't exist
if [ ! -d "env" ]; then
    echo "Creating virtual environment..."
    python3 -m venv env
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create virtual environment"
        exit 1
    fi
    echo "Virtual environment created successfully!"
else
    echo "Virtual environment already exists"
fi

echo
echo "Activating virtual environment..."
source env/bin/activate
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to activate virtual environment"
    exit 1
fi

echo
echo "Installing/updating dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

echo
echo "========================================"
echo "Installation/Update complete!"
echo "========================================"
echo
echo "You can now run ./start_server.sh to start the server"
echo
