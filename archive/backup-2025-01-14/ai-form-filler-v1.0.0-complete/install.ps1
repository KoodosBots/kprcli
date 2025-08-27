# AI Form Filler Installer v1.0.0
# Run as Administrator

Write-Host "Installing AI Form Filler v1.0.0..." -ForegroundColor Green

# Install paths
$InstallDir = "$env:ProgramFiles\AI Form Filler"
$ExePath = "$InstallDir\ai-form-filler.exe"

# Create directory and copy files
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item "ai-form-filler.exe" $InstallDir -Force

# Create native messaging manifest
$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI"
    path = $ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/")
} | ConvertTo-Json

# Save manifest and register
$ManifestPath = "$InstallDir\manifest.json"
$Manifest | Out-File $ManifestPath -Encoding UTF8

$RegPath = "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath

Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "Next: Install the browser extension"