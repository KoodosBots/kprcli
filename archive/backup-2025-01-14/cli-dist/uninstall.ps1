# AI Form Filler CLI Uninstaller

Write-Host "Uninstalling AI Form Filler CLI..." -ForegroundColor Yellow

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This uninstaller requires administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Remove installation directory
if (Test-Path "C:\Program Files\AI Form Filler") {
    Remove-Item "C:\Program Files\AI Form Filler" -Recurse -Force
    Write-Host "Removed installation directory"
}

# Remove manifest directory
$ManifestDir = Join-Path $env:ProgramData "AI Form Filler"
if (Test-Path $ManifestDir) {
    Remove-Item $ManifestDir -Recurse -Force
    Write-Host "Removed configuration files"
}

# Remove registry entry
$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
if (Test-Path $RegPath) {
    Remove-Item $RegPath -Force
    Write-Host "Removed Chrome native messaging registration"
}

Write-Host ""
Write-Host "Uninstallation completed successfully!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
