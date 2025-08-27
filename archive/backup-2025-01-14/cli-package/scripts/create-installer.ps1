# AI Form Filler - Professional Installer Creator
# Creates a complete installer package for distribution

param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = "../../dist",
    [switch]$Sign = $false
)

Write-Host "Creating AI Form Filler Installer v$Version" -ForegroundColor Green

# Ensure CLI is built
if (-not (Test-Path "ai-form-filler.exe")) {
    Write-Host "Building CLI..." -ForegroundColor Yellow
    go build -o ai-form-filler.exe .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build CLI"
        exit 1
    }
}

# Create output directory
$OutputPath = Join-Path $PSScriptRoot $OutputDir
New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null

# Create installer directory structure
$InstallerDir = Join-Path $OutputPath "ai-form-filler-installer"
$BinDir = Join-Path $InstallerDir "bin"
$ScriptsDir = Join-Path $InstallerDir "scripts"

New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null

# Copy CLI executable
Copy-Item "ai-form-filler.exe" $BinDir
Write-Host "✓ Copied CLI executable"

# Create main installer script
$MainInstaller = @"
# AI Form Filler Installer v$Version
# Professional installation script

param(
    [string]$InstallPath = "$env:ProgramFiles\AI Form Filler",
    [switch]$Uninstall = $false,
    [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"

function Write-Status($Message, $Color = "White") {
    if (-not $Silent) {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Test-Administrator {
    `$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    `$principal = New-Object Security.Principal.WindowsPrincipal(`$currentUser)
    return `$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Error "This installer requires administrator privileges. Please run as administrator."
    exit 1
}

if (`$Uninstall) {
    Write-Status "Uninstalling AI Form Filler..." "Yellow"
    
    # Remove native messaging registry
    `$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
    if (Test-Path `$RegPath) {
        Remove-Item `$RegPath -Force
        Write-Status "✓ Removed Chrome native messaging registration"
    }
    
    # Remove installation directory
    if (Test-Path `$InstallPath) {
        Remove-Item `$InstallPath -Recurse -Force
        Write-Status "✓ Removed installation files"
    }
    
    # Remove from PATH
    `$currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    if (`$currentPath -like "*`$InstallPath*") {
        `$newPath = `$currentPath -replace [regex]::Escape("`$InstallPath;"), ""
        `$newPath = `$newPath -replace [regex]::Escape(";`$InstallPath"), ""
        [Environment]::SetEnvironmentVariable("PATH", `$newPath, "Machine")
        Write-Status "✓ Removed from system PATH"
    }
    
    Write-Status "AI Form Filler uninstalled successfully!" "Green"
    exit 0
}

Write-Status "Installing AI Form Filler v$Version..." "Green"
Write-Status "Installation path: `$InstallPath"

# Create installation directory
New-Item -ItemType Directory -Path `$InstallPath -Force | Out-Null

# Copy files
Copy-Item "`$PSScriptRoot\bin\*" `$InstallPath -Recurse -Force
Write-Status "✓ Copied application files"

# Add to PATH
`$currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
if (`$currentPath -notlike "*`$InstallPath*") {
    [Environment]::SetEnvironmentVariable("PATH", "`$currentPath;`$InstallPath", "Machine")
    Write-Status "✓ Added to system PATH"
}

# Create native messaging manifest
`$ExePath = Join-Path `$InstallPath "ai-form-filler.exe"
`$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI Native Messaging Host"
    path = `$ExePath
    type = "stdio"
    allowed_origins = @(
        "chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/"
    )
} | ConvertTo-Json -Depth 3

# Install for Chrome (system-wide)
`$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
`$ManifestPath = Join-Path `$InstallPath "com.ai_form_filler.cli.json"

`$Manifest | Out-File -FilePath `$ManifestPath -Encoding UTF8
New-Item -Path `$RegPath -Force | Out-Null
Set-ItemProperty -Path `$RegPath -Name "(Default)" -Value `$ManifestPath

Write-Status "✓ Registered Chrome native messaging host"

# Create desktop shortcut
`$WshShell = New-Object -comObject WScript.Shell
`$Shortcut = `$WshShell.CreateShortcut("`$env:PUBLIC\Desktop\AI Form Filler.lnk")
`$Shortcut.TargetPath = `$ExePath
`$Shortcut.Arguments = "dashboard"
`$Shortcut.Description = "AI Form Filler Dashboard"
`$Shortcut.Save()
Write-Status "✓ Created desktop shortcut"

# Create start menu shortcut
`$StartMenuPath = "`$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
`$StartMenuShortcut = `$WshShell.CreateShortcut("`$StartMenuPath\AI Form Filler.lnk")
`$StartMenuShortcut.TargetPath = `$ExePath
`$StartMenuShortcut.Arguments = "dashboard"
`$StartMenuShortcut.Description = "AI Form Filler Dashboard"
`$StartMenuShortcut.Save()
Write-Status "✓ Created start menu shortcut"

Write-Status ""
Write-Status "AI Form Filler installed successfully!" "Green"
Write-Status ""
Write-Status "Next steps:" "Yellow"
Write-Status "1. Install the browser extension from Chrome Web Store"
Write-Status "2. Launch 'AI Form Filler' from desktop or start menu"
Write-Status "3. Create your first profile and start automating forms!"
Write-Status ""
Write-Status "For support, visit: https://github.com/your-repo/ai-form-filler"
"@

$MainInstaller | Out-File -FilePath (Join-Path $InstallerDir "install.ps1") -Encoding UTF8
Write-Host "✓ Created main installer script"

# Create uninstaller
$Uninstaller = @"
# AI Form Filler Uninstaller
& "`$PSScriptRoot\install.ps1" -Uninstall
"@

$Uninstaller | Out-File -FilePath (Join-Path $InstallerDir "uninstall.ps1") -Encoding UTF8
Write-Host "✓ Created uninstaller script"

# Create README
$ReadMe = @"
# AI Form Filler v$Version

## Installation

1. **Run as Administrator**: Right-click on `install.ps1` and select "Run as Administrator"
2. **Follow prompts**: The installer will guide you through the process
3. **Install Extension**: Get the browser extension from Chrome Web Store

## What gets installed:

- CLI application in Program Files
- Native messaging host for Chrome
- Desktop and Start Menu shortcuts
- System PATH entry for command-line access

## Uninstallation

Run `uninstall.ps1` as Administrator to completely remove AI Form Filler.

## Manual Installation

If the automated installer doesn't work:

1. Copy `bin\ai-form-filler.exe` to a permanent location
2. Run: `ai-form-filler.exe native-messaging --install`
3. Install the browser extension

## Support

- Documentation: https://github.com/your-repo/ai-form-filler
- Issues: https://github.com/your-repo/ai-form-filler/issues

## Version: $Version
Built: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

$ReadMe | Out-File -FilePath (Join-Path $InstallerDir "README.md") -Encoding UTF8
Write-Host "✓ Created README"

# Create version info
$VersionInfo = @{
    version = $Version
    buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    components = @{
        cli = "ai-form-filler.exe"
        extension = "Available separately from Chrome Web Store"
    }
} | ConvertTo-Json -Depth 3

$VersionInfo | Out-File -FilePath (Join-Path $InstallerDir "version.json") -Encoding UTF8
Write-Host "✓ Created version info"

# Create ZIP package
$ZipPath = Join-Path $OutputPath "ai-form-filler-v$Version-windows.zip"
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($InstallerDir, $ZipPath)

Write-Host ""
Write-Host "✅ Installer package created successfully!" -ForegroundColor Green
Write-Host "📦 Package: $ZipPath" -ForegroundColor Cyan
Write-Host "📁 Installer: $InstallerDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Distribution ready! Users can:" -ForegroundColor Yellow
Write-Host "1. Download and extract the ZIP file"
Write-Host "2. Run install.ps1 as Administrator"
Write-Host "3. Install the browser extension"
Write-Host ""