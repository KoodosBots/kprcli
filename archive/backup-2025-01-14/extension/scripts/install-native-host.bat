@echo off
REM Install script for AI Form Filler native messaging host on Windows
REM This script installs the native messaging host manifest for Chrome

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "EXTENSION_DIR=%SCRIPT_DIR%.."
set "CLI_PATH=%EXTENSION_DIR%\..\..\cli\ai-form-filler-cli.exe"

echo Installing AI Form Filler native messaging host...

REM Check if CLI binary exists
if not exist "%CLI_PATH%" (
    echo CLI binary not found at %CLI_PATH%
    echo Please build the CLI first with: cd packages\cli ^&^& go build -o ai-form-filler-cli.exe
    pause
    exit /b 1
)

REM Set Chrome native messaging directory
set "CHROME_DIR=%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts"

REM Create directory if it doesn't exist
if not exist "%CHROME_DIR%" mkdir "%CHROME_DIR%"

REM Create native messaging host manifest
set "MANIFEST_FILE=%CHROME_DIR%\com.ai_form_filler.cli.json"

(
echo {
echo   "name": "com.ai_form_filler.cli",
echo   "description": "AI Form Filler CLI Native Messaging Host",
echo   "path": "%CLI_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://EXTENSION_ID_PLACEHOLDER/"
echo   ]
echo }
) > "%MANIFEST_FILE%"

echo Installed native messaging host manifest at: %MANIFEST_FILE%

echo.
echo Native messaging host installation completed!
echo.
echo Next steps:
echo 1. Build and install the Chrome extension
echo 2. Update the manifest file with the actual extension ID
echo 3. Test the connection between extension and CLI
echo.
echo To update the extension ID, edit the file:
echo   %MANIFEST_FILE%
echo And replace EXTENSION_ID_PLACEHOLDER with your actual extension ID

pause