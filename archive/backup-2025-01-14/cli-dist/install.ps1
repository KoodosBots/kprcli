# AI Form Filler CLI Installer
# Version: 1.0.0

Write-Host "Installing AI Form Filler CLI..." -ForegroundColor Green

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This installer requires administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Create installation directory
Write-Host "Creating installation directory..."
New-Item -ItemType Directory -Path "C:\Program Files\AI Form Filler" -Force | Out-Null

# Copy executable
Write-Host "Installing CLI executable..."
Copy-Item -Path "$PSScriptRoot\ai-form-filler.exe" -Destination "C:\Program Files\AI Form Filler\ai-form-filler.exe" -Force

# Install native messaging host
Write-Host "Configuring native messaging..."

# Create manifest
$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI Native Messaging Host"
    path = "C:\Program Files\AI Form Filler\ai-form-filler.exe"
    type = "stdio"
    allowed_origins = @(
        "chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/"
    )
} | ConvertTo-Json -Depth 3

# Create manifest directory
$ManifestDir = Join-Path $env:ProgramData "AI Form Filler"
New-Item -ItemType Directory -Path $ManifestDir -Force | Out-Null

# Save manifest
$ManifestPath = Join-Path $ManifestDir "com.ai_form_filler.cli.json"
$Manifest | Out-File -FilePath $ManifestPath -Encoding UTF8

# Register with Chrome
$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath

Write-Host ""
Write-Host "Installation completed successfully!" -ForegroundColor Green
Write-Host "Installed to: C:\Program Files\AI Form Filler"
Write-Host "Native messaging configured for Chrome"
Write-Host ""
Write-Host "You can now install the browser extension from the Chrome Web Store."
Write-Host ""
Read-Host "Press Enter to exit"
