@echo off
title AI Form Filler - Easy Install
color 0A

echo ===========================================================
echo         AI FORM FILLER - CHROME EXTENSION INSTALLER
echo ===========================================================
echo.
echo This will install the AI Form Filler extension in Chrome
echo.

:: Copy the simplified background script over the complex one
echo Preparing extension files...
copy /Y "%~dp0packages\cli\ai-form-filler-v1.0.0-complete\extension-for-chrome\background-simple.js" "%~dp0packages\cli\ai-form-filler-v1.0.0-complete\extension-for-chrome\background.js" >nul 2>&1

if %errorlevel% neq 0 (
    echo ERROR: Could not prepare extension files.
    echo Please make sure you're running this from the correct folder.
    pause
    exit /b 1
)

echo Extension files prepared successfully!
echo.
echo ===========================================================
echo                  INSTALLATION INSTRUCTIONS
echo ===========================================================
echo.
echo Please follow these simple steps:
echo.
echo 1. Chrome will open automatically
echo 2. Click "Load unpacked" button (top left)
echo 3. Select this folder when prompted:
echo    %~dp0packages\cli\ai-form-filler-v1.0.0-complete\extension-for-chrome
echo 4. The extension is now installed!
echo.
echo ===========================================================
echo.
echo Press any key to open Chrome Extensions page...
pause >nul

:: Open Chrome extensions page
start chrome "chrome://extensions/"

echo.
echo ===========================================================
echo               INSTALLATION COMPLETE!
echo ===========================================================
echo.
echo The AI Form Filler extension should now be installed.
echo Look for the extension icon in your Chrome toolbar.
echo.
echo If you don't see it:
echo - Make sure "Developer mode" is ON (top right toggle)
echo - Click "Load unpacked" and select the extension folder
echo.
pause
