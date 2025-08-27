@echo off
REM AI Form Filler Uninstaller v1.0.0

echo.
echo ========================================
echo   AI Form Filler v1.0.0 Uninstaller
echo ========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with administrator privileges
    goto :uninstall
) else (
    echo [ERROR] This uninstaller requires administrator privileges.
    echo.
    echo Please right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

:uninstall
echo [INFO] Uninstalling AI Form Filler...

set INSTALL_DIR=%ProgramFiles%\AI Form Filler

REM Remove Chrome native messaging registration
echo [INFO] Removing Chrome integration...
reg delete "HKLM\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" /f >nul 2>&1

REM Remove from PATH
echo [INFO] Removing from system PATH...
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "CURRENT_PATH=%%B"
set "NEW_PATH=%CURRENT_PATH%"
set "NEW_PATH=%NEW_PATH:;%INSTALL_DIR%=%"
set "NEW_PATH=%NEW_PATH:%INSTALL_DIR%;=%"
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH /t REG_EXPAND_SZ /d "%NEW_PATH%" /f >nul

REM Remove desktop shortcut
echo [INFO] Removing desktop shortcut...
if exist "%PUBLIC%\Desktop\AI Form Filler.lnk" del "%PUBLIC%\Desktop\AI Form Filler.lnk"

REM Remove installation directory
echo [INFO] Removing installation files...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
)

echo.
echo ========================================
echo   Uninstallation Complete!
echo ========================================
echo.
echo [SUCCESS] AI Form Filler has been completely removed.
echo.
echo NOTE: You may need to restart your browser for changes to take effect.
echo.
pause