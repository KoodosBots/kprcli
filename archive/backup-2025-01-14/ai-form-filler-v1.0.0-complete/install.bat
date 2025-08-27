@echo off
REM AI Form Filler Installer v1.0.0
REM This batch file will install AI Form Filler with administrator privileges

echo.
echo ========================================
echo   AI Form Filler v1.0.0 Installer
echo ========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with administrator privileges
    goto :install
) else (
    echo [ERROR] This installer requires administrator privileges.
    echo.
    echo Please right-click this file and select "Run as administrator"
    echo Or run from an elevated command prompt.
    echo.
    pause
    exit /b 1
)

:install
echo [INFO] Installing AI Form Filler...

REM Create installation directory
set INSTALL_DIR=%ProgramFiles%\AI Form Filler
echo [INFO] Creating directory: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to create installation directory
        echo [INFO] Please check if you have administrator privileges
        pause
        exit /b 1
    )
)
echo [OK] Installation directory ready

REM Copy executable
echo [INFO] Copying ai-form-filler.exe...
if not exist "ai-form-filler.exe" (
    echo [ERROR] ai-form-filler.exe not found in current directory
    echo [INFO] Please make sure you're running this from the extracted folder
    echo [INFO] Current directory: %CD%
    dir ai-form-filler.exe 2>nul || echo [INFO] File not found in current directory
    pause
    exit /b 1
)

copy "ai-form-filler.exe" "%INSTALL_DIR%\ai-form-filler.exe"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to copy executable to %INSTALL_DIR%
    echo [INFO] This might be due to:
    echo [INFO] - Antivirus blocking the file
    echo [INFO] - Insufficient permissions
    echo [INFO] - File is in use
    echo [INFO] Please try:
    echo [INFO] 1. Temporarily disable antivirus
    echo [INFO] 2. Close any running instances of ai-form-filler.exe
    echo [INFO] 3. Run this installer again
    pause
    exit /b 1
)
echo [OK] Executable copied successfully

REM Create native messaging manifest using PowerShell
echo [INFO] Setting up Chrome native messaging...
powershell -Command "& {$manifest = @{name='com.ai_form_filler.cli';description='AI Form Filler CLI';path='%INSTALL_DIR%\ai-form-filler.exe';type='stdio';allowed_origins=@('chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/')} | ConvertTo-Json; $manifest | Out-File '%INSTALL_DIR%\manifest.json' -Encoding UTF8}"

REM Register with Chrome
echo [INFO] Registering with Chrome...
reg add "HKLM\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli" /ve /t REG_SZ /d "%INSTALL_DIR%\manifest.json" /f >nul 2>&1

REM Add to PATH (optional)
echo [INFO] Adding to system PATH...
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "CURRENT_PATH=%%B"
echo %CURRENT_PATH% | find /i "%INSTALL_DIR%" >nul
if %errorLevel% neq 0 (
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH /t REG_EXPAND_SZ /d "%CURRENT_PATH%;%INSTALL_DIR%" /f >nul
)

REM Create desktop shortcut
echo [INFO] Creating desktop shortcut...
powershell -Command "& {$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%PUBLIC%\Desktop\AI Form Filler.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\ai-form-filler.exe'; $Shortcut.Arguments = 'dashboard'; $Shortcut.Description = 'AI Form Filler Dashboard'; $Shortcut.Save()}"

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo [SUCCESS] AI Form Filler has been installed successfully!
echo.
echo Installation location: %INSTALL_DIR%
echo Desktop shortcut: Created
echo Chrome integration: Configured
echo.
echo NEXT STEPS:
echo 1. Install the browser extension from Chrome Web Store
echo 2. Launch "AI Form Filler" from desktop shortcut
echo 3. Create your first profile and start filling forms!
echo.
echo For support, visit: https://github.com/your-repo/ai-form-filler
echo.
pause