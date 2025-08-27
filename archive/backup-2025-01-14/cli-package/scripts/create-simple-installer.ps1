# AI Form Filler - Simple Installer Creator
param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = "../../dist"
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

# Create installer directory
$InstallerDir = Join-Path $OutputPath "ai-form-filler-installer"
New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null

# Copy CLI executable
Copy-Item "ai-form-filler.exe" $InstallerDir
Write-Host "✓ Copied CLI executable"

# Create simple install script
$InstallScript = @'
# AI Form Filler Simple Installer
Write-Host "Installing AI Form Filler..." -ForegroundColor Green

$InstallPath = "$env:ProgramFiles\AI Form Filler"
$ExePath = "$InstallPath\ai-form-filler.exe"

# Create install directory
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# Copy executable
Copy-Item "ai-form-filler.exe" $InstallPath -Force
Write-Host "✓ Installed CLI to $InstallPath"

# Create native messaging manifest
$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI Native Messaging Host"
    path = $ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/")
} | ConvertTo-Json -Depth 3

# Install native messaging for Chrome
$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
$ManifestPath = "$InstallPath\com.ai_form_filler.cli.json"

$Manifest | Out-File -FilePath $ManifestPath -Encoding UTF8
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath

Write-Host "✓ Registered Chrome native messaging"
Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "Next: Install the browser extension from Chrome Web Store"
'@

$InstallScript | Out-File -FilePath (Join-Path $InstallerDir "install.ps1") -Encoding UTF8
Write-Host "✓ Created install script"

# Create README
$ReadMe = @"
# AI Form Filler v$Version

## Installation Instructions

1. **Run as Administrator**: Right-click `install.ps1` and select "Run as Administrator"
2. **Install Extension**: Get the browser extension from Chrome Web Store
3. **Test**: Open extension popup and create a profile

## What gets installed:
- CLI application in Program Files
- Native messaging registration for Chrome

## Manual Installation:
If automated install fails, run these commands as Administrator:

```powershell
# Copy executable to Program Files
Copy-Item "ai-form-filler.exe" "$env:ProgramFiles\AI Form Filler\" -Force

# Register native messaging
.\ai-form-filler.exe native-messaging --install
```

## Support:
- GitHub: https://github.com/your-repo/ai-form-filler
- Version: $Version
"@

$ReadMe | Out-File -FilePath (Join-Path $InstallerDir "README.md") -Encoding UTF8
Write-Host "✓ Created README"

# Create ZIP package
$ZipPath = Join-Path $OutputPath "ai-form-filler-v$Version-windows.zip"
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($InstallerDir, $ZipPath)

Write-Host ""
Write-Host "✅ Installer created successfully!" -ForegroundColor Green
Write-Host "📦 Package: $ZipPath" -ForegroundColor Cyan
Write-Host ""