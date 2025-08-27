# AI Form Filler Extension Package Creator
# Creates a distributable extension package

param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = "dist-package"
)

Write-Host "Creating AI Form Filler Extension Package v$Version" -ForegroundColor Green

# Create output directory
$PackagePath = Join-Path $PSScriptRoot "..\$OutputDir"
if (Test-Path $PackagePath) {
    Remove-Item $PackagePath -Recurse -Force
}
New-Item -ItemType Directory -Path $PackagePath -Force | Out-Null

# Copy built extension
$DistPath = Join-Path $PSScriptRoot "..\dist"
if (Test-Path $DistPath) {
    Copy-Item -Path "$DistPath\*" -Destination $PackagePath -Recurse
    Write-Host "Copied extension files to package"
} else {
    Write-Warning "Extension not built. Please run 'npm run build' first"
    exit 1
}

# Create extension README
$ExtensionReadme = @"
# AI Form Filler Browser Extension

## Installation Options

### Option 1: Chrome Web Store (Recommended)
1. Visit the Chrome Web Store
2. Search for "AI Form Filler"
3. Click "Add to Chrome"

### Option 2: Manual Installation (Developer Mode)
1. Open Chrome and go to chrome://extensions/
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this folder
5. The extension will be loaded with ID: bkjcdkjmponebhdddobplhbfpfcacpjn

## Prerequisites
- **Chrome Browser** (version 88 or higher)
- **AI Form Filler CLI** must be installed first
  - Download CLI installer from [your download link]
  - Run as Administrator to install

## Features
- Automatic form detection and filling
- Profile management
- Secure local storage via CLI
- Cross-site form templates
- Advanced automation capabilities

## Usage
1. Click the extension icon in Chrome toolbar
2. Create or select a profile
3. Navigate to any form on the web
4. Click "Fill Form" to automatically populate fields

## Troubleshooting
- **"Native messaging disconnected"**: Install the CLI component
- **Extension not working**: Refresh the page and try again
- **Forms not detected**: Check if the page has loaded completely

## Privacy & Security
- All data stored locally on your machine
- No data sent to external servers
- Encrypted profile storage via CLI
- Open source and auditable

Version: $Version
"@

$ExtReadmePath = Join-Path $PackagePath "README.md"
$ExtensionReadme | Out-File -FilePath $ExtReadmePath -Encoding UTF8

Write-Host ""
Write-Host "Extension package created successfully!" -ForegroundColor Green
Write-Host "Location: $PackagePath"
Write-Host ""
Write-Host "Contents:"
Get-ChildItem $PackagePath | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host ""
Write-Host "This package can be:"
Write-Host "1. Submitted to Chrome Web Store"
Write-Host "2. Distributed for manual installation"