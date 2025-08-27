@echo off
REM AI Form Filler Troubleshooting Tool

echo.
echo ========================================
echo   AI Form Filler Troubleshooting
echo ========================================
echo.

echo [INFO] Checking installation status...
echo.

REM Check if files exist
echo --- File Check ---
if exist "ai-form-filler.exe" (
    echo [OK] ai-form-filler.exe found in current directory
    for %%I in (ai-form-filler.exe) do echo [INFO] File size: %%~zI bytes
) else (
    echo [ERROR] ai-form-filler.exe NOT found in current directory
)

REM Check Program Files installation
set INSTALL_DIR_SYSTEM=%ProgramFiles%\AI Form Filler
if exist "%INSTALL_DIR_SYSTEM%\ai-form-filler.exe" (
    echo [OK] System installation found: %INSTALL_DIR_SYSTEM%
) else (
    echo [INFO] No system installation found
)

REM Check user installation
set INSTALL_DIR_USER=%LOCALAPPDATA%\AI Form Filler
if exist "%INSTALL_DIR_USER%\ai-form-filler.exe" (
    echo [OK] User installation found: %INSTALL_DIR_USER%
) else (
    echo [INFO] No user installation found
)

echo.
echo --- Registry Check ---
REM Check Chrome native messaging registration (system)
reg query "HKLM\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] System-level Chrome registration found
    for /f "tokens=2*" %%A in ('reg query "HKLM\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" /ve 2^>nul') do echo [INFO] Manifest path: %%B
) else (
    echo [INFO] No system-level Chrome registration
)

REM Check Chrome native messaging registration (user)
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] User-level Chrome registration found
    for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" /ve 2^>nul') do echo [INFO] Manifest path: %%B
) else (
    echo [INFO] No user-level Chrome registration
)

echo.
echo --- Chrome Check ---
REM Check if Chrome is installed
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome found in Program Files
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome found in Program Files (x86)
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome found in user directory
) else (
    echo [WARNING] Chrome not found in standard locations
)

echo.
echo --- Permissions Check ---
REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with administrator privileges
) else (
    echo [INFO] Running as regular user (not administrator)
)

echo.
echo --- Test CLI ---
if exist "ai-form-filler.exe" (
    echo [INFO] Testing CLI executable...
    "ai-form-filler.exe" --version 2>nul
    if %errorLevel% == 0 (
        echo [OK] CLI executable works
    ) else (
        echo [WARNING] CLI executable may have issues
    )
) else (
    echo [SKIP] CLI executable not found for testing
)

echo.
echo ========================================
echo   Troubleshooting Complete
echo ========================================
echo.
echo RECOMMENDATIONS:
echo.
if not exist "ai-form-filler.exe" (
    echo - Extract the ZIP file completely before running installer
)
echo - Try install-user.bat if install.bat fails (no admin required)
echo - Temporarily disable antivirus during installation
echo - Make sure Chrome is installed and up to date
echo - Check that no other instances of ai-form-filler.exe are running
echo.
pause