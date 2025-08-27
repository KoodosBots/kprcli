# Simple Release Builder for AI Form Filler
param([string]$Version = "1.0.0")

Write-Host "Building AI Form Filler v$Version" -ForegroundColor Green

# Build CLI
Write-Host "Building CLI..." -ForegroundColor Yellow
go build -o ai-form-filler.exe .
if ($LASTEXITCODE -ne 0) { exit 1 }

# Create release directory
$ReleaseDir = "release-v$Version"
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

# Copy files
Copy-Item "ai-form-filler.exe" $ReleaseDir
Write-Host "✓ CLI copied to $ReleaseDir"

# Create install script
$InstallContent = @"
# AI Form Filler Installer v$Version
# Run as Administrator

Write-Host "Installing AI Form Filler v$Version..." -ForegroundColor Green

# Install paths
`$InstallDir = "`$env:ProgramFiles\AI Form Filler"
`$ExePath = "`$InstallDir\ai-form-filler.exe"

# Create directory and copy files
New-Item -ItemType Directory -Path `$InstallDir -Force | Out-Null
Copy-Item "ai-form-filler.exe" `$InstallDir -Force

# Create native messaging manifest
`$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI"
    path = `$ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/")
} | ConvertTo-Json

# Save manifest and register
`$ManifestPath = "`$InstallDir\manifest.json"
`$Manifest | Out-File `$ManifestPath -Encoding UTF8

`$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
New-Item -Path `$RegPath -Force | Out-Null
Set-ItemProperty -Path `$RegPath -Name "(Default)" -Value `$ManifestPath

Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host "Next: Install the browser extension"
"@

$InstallContent | Out-File "$ReleaseDir\install.ps1" -Encoding UTF8

# Create README
$ReadmeContent = @"
# AI Form Filler v$Version

## Installation

1. Right-click `install.ps1` and "Run as Administrator"
2. Install the browser extension from Chrome Web Store
3. Open extension popup to create profiles

## Files

- `ai-form-filler.exe` - Main CLI application
- `install.ps1` - Installation script (run as admin)
- `README.md` - This file

## Support

GitHub: https://github.com/your-repo/ai-form-filler
"@

$ReadmeContent | Out-File "$ReleaseDir\README.md" -Encoding UTF8

Write-Host "✅ Release v$Version ready in $ReleaseDir" -ForegroundColor Green
Write-Host ""
Write-Host "Distribution files:" -ForegroundColor Cyan
Get-ChildItem $ReleaseDir | ForEach-Object { Write-Host "  📄 $($_.Name)" }
Write-Host ""