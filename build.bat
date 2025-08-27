@echo off
title AI Form Filler - Build
color 0A

echo ========================================
echo     AI FORM FILLER - BUILD SCRIPT
echo ========================================
echo.

:: Build the Go application
echo Building AI Form Filler...
go build -o ai-form-filler.exe main.go

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ✅ Build successful!
echo.
echo Output: ai-form-filler.exe
echo.
echo Run with: ai-form-filler.exe
echo     or: RUN.bat
echo.
pause
