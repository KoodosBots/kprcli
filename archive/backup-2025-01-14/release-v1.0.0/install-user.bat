@echo off
REM AI Form Filler User Installer v1.0.0
REM Installs to user directory (no admin required)

echo.
echo ========================================
echo   AI Form Filler v1.0.0 User Installer
echo ========================================
echo.
echo [INFO] This installer will install AI Form Filler to your user directory
echo [INFO] No administrator privileges required!
echo.

REM Create installation directory in user's AppData
set INSTALL_DIR=%LOCALAPPDATA%\AI Form Filler
echo [INFO] Installing to: %INSTALL_DIR%

if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to create installation directory
        pause
        exit /b 1
    )
)
echo [OK] Installation directory created

REM Copy executable
echo [INFO] Copying ai-form-filler.exe...
if not exist "ai-form-filler.exe" (
    echo [ERROR] ai-form-filler.exe not found in current directory
    echo [INFO] Please make sure you're running this from the extracted folder
    pause
    exit /b 1
)

copy "ai-form-filler.exe" "%INSTALL_DIR%\ai-form-filler.exe"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to copy executable
    pause
    exit /b 1
)
echo [OK] Executable copied successfully

REM Create native messaging manifest using PowerShell
echo [INFO] Setting up Chrome native messaging...
powershell -Command "& {$manifest = @{name='com.ai_form_filler.cli';description='AI Form Filler CLI';path='%INSTALL_DIR%\ai-form-filler.exe';type='stdio';allowed_origins=@('chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/')} | ConvertTo-Json; $manifest | Out-File '%INSTALL_DIR%\manifest.json' -Encoding UTF8}"

REM Register with Chrome (user-level)
echo [INFO] Registering with Chrome (user-level)...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" /ve /t REG_SZ /d "%INSTALL_DIR%\manifest.json" /f >nul 2>&1

REM Create desktop shortcut
echo [INFO] Creating desktop shortcut...
powershell -Command "& {$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\AI Form Filler.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\ai-form-filler.exe'; $Shortcut.Arguments = 'dashboard'; $Shortcut.Description = 'AI Form Filler Dashboard'; $Shortcut.Save()}"

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo [SUCCESS] AI Form Filler has been installed successfully!
echo.
echo Installation location: %INSTALL_DIR%
echo Desktop shortcut: Created
echo Chrome integration: Configured (user-level)
echo.
echo NEXT STEPS:
echo 1. Install the browser extension from Chrome Web Store
echo 2. Launch "AI Form Filler" from desktop shortcut
echo 3. Create your first profile and start filling forms!
echo.
echo NOTE: This is a user-level installation (no admin required)
echo If you need system-wide installation, use install.bat as administrator
echo.
pause