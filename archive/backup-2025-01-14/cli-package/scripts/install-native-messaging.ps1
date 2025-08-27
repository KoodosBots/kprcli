# Install Native Messaging Host for AI Form Filler
param(
    [string]$ExtensionId = "bkjcdkjmponebhdddobplhbfpfcacpjn"
)

# Get the current directory (where the CLI executable is located)
$CliPath = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $CliPath "ai-form-filler.exe"

# Ensure the executable exists
if (-not (Test-Path $ExePath)) {
    Write-Error "CLI executable not found at: $ExePath"
    Write-Host "Please run 'go build -o ai-form-filler.exe .' in the packages/cli directory first"
    exit 1
}

# Create the manifest with the correct path
$Manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI Native Messaging Host"
    path = $ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 3

# Registry path for Chrome native messaging hosts
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"

# Create the registry key
try {
    New-Item -Path $RegPath -Force | Out-Null
    Write-Host "Created registry key: $RegPath"
} catch {
    Write-Error "Failed to create registry key: $_"
    exit 1
}

# Create manifest file in a temp location
$ManifestPath = Join-Path $env:TEMP "com.ai_form_filler.cli.json"
$Manifest | Out-File -FilePath $ManifestPath -Encoding UTF8

# Set the registry value to point to the manifest
try {
    Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath
    Write-Host "Installed native messaging host manifest at: $ManifestPath"
    Write-Host "Registry entry created successfully"
} catch {
    Write-Error "Failed to set registry value: $_"
    exit 1
}

Write-Host ""
Write-Host "Native messaging host installed successfully!"
Write-Host "Extension ID: $ExtensionId"
Write-Host "CLI Path: $ExePath"
Write-Host "Manifest Path: $ManifestPath"
Write-Host ""
Write-Host "You can now test the extension with native messaging support."