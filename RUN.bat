@echo off
title AI Form Filler
color 0A

echo ===========================================================
echo              AI FORM FILLER - STARTING...
echo ===========================================================
echo.

:: Check if Go is installed
where go >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Go is not installed or not in PATH
    echo.
    echo Please install Go from: https://golang.org/dl/
    echo.
    pause
    exit /b 1
)

:: Run the application
echo Starting AI Form Filler...
echo.
go run main.go

:: If it fails, pause to show error
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start the application
    pause
)
