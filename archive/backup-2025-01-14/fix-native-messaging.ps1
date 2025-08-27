# Fix Native Messaging for AI Form Filler Extension Development
# This script updates the native messaging manifest to allow your development extension

Write-Host "AI Form Filler - Native Messaging Configuration Fix" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan

# Step 1: Get the development extension ID
Write-Host "`nStep 1: Getting your development extension ID" -ForegroundColor Yellow
Write-Host "Please follow these steps:" -ForegroundColor White
Write-Host "1. Open Chrome and go to: chrome://extensions/" -ForegroundColor White
Write-Host "2. Enable 'Developer mode' (toggle in top right)" -ForegroundColor White
Write-Host "3. Click 'Load unpacked' and select: C:\Users\Work\Desktop\KprCLi\packages\cli\ai-form-filler-v1.0.0-complete\extension-for-chrome" -ForegroundColor White
Write-Host "4. Once loaded, copy the Extension ID shown under the extension name" -ForegroundColor White
Write-Host ""

$extensionId = Read-Host "Please enter your development Extension ID"

if ([string]::IsNullOrWhiteSpace($extensionId)) {
    Write-Host "Extension ID cannot be empty. Exiting..." -ForegroundColor Red
    exit 1
}

# Step 2: Backup the current manifest
$manifestPath = "C:\Users\Work\AppData\Local\AI Form Filler\manifest.json"
$backupPath = "C:\Users\Work\AppData\Local\AI Form Filler\manifest.backup.json"

Write-Host "`nStep 2: Backing up current manifest..." -ForegroundColor Yellow
if (Test-Path $manifestPath) {
    Copy-Item -Path $manifestPath -Destination $backupPath -Force
    Write-Host "Backup created at: $backupPath" -ForegroundColor Green
} else {
    Write-Host "Manifest file not found. Creating new one..." -ForegroundColor Yellow
    New-Item -Path "C:\Users\Work\AppData\Local\AI Form Filler" -ItemType Directory -Force | Out-Null
}

# Step 3: Create the CLI executable if it doesn't exist
$cliPath = "C:\Users\Work\Desktop\KprCLi\packages\cli\ai-form-filler.exe"
$targetPath = "C:\Users\Work\AppData\Local\AI Form Filler\ai-form-filler.exe"

if (-not (Test-Path $targetPath)) {
    Write-Host "`nStep 3: Setting up CLI executable..." -ForegroundColor Yellow
    
    # Check if source CLI exists
    if (Test-Path $cliPath) {
        Copy-Item -Path $cliPath -Destination $targetPath -Force
        Write-Host "CLI executable copied to: $targetPath" -ForegroundColor Green
    } else {
        # Create a simple echo executable for testing
        Write-Host "Creating placeholder CLI executable for testing..." -ForegroundColor Yellow
        
        # Create a simple batch file that acts as the native messaging host
        $batchContent = @'
@echo off
setlocal enabledelayedexpansion

:read_loop
set /p input=
if not defined input goto :eof

REM Simple echo response for testing
echo {"success": true, "message": "Native messaging host is working", "received": "!input!"}

goto read_loop
'@
        
        $batchPath = "C:\Users\Work\AppData\Local\AI Form Filler\ai-form-filler.bat"
        Set-Content -Path $batchPath -Value $batchContent -Encoding ASCII
        
        # Create a wrapper exe that calls the batch file (using PowerShell to create a simple wrapper)
        $wrapperContent = @'
@echo off
"C:\Users\Work\AppData\Local\AI Form Filler\ai-form-filler.bat"
'@
        Set-Content -Path $targetPath.Replace('.exe', '.cmd') -Value $wrapperContent -Encoding ASCII
        
        # For now, we'll use the .bat file directly
        $targetPath = $batchPath
        
        Write-Host "Placeholder CLI created at: $targetPath" -ForegroundColor Green
    }
}

# Step 4: Create updated manifest
Write-Host "`nStep 4: Creating updated manifest..." -ForegroundColor Yellow

$manifest = @{
    name = "com.ai_form_filler.cli"
    description = "AI Form Filler CLI"
    path = $targetPath.Replace('\', '\\')
    type = "stdio"
    allowed_origins = @(
        "chrome-extension://$($extensionId)/",
        "chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/"  # Keep original for compatibility
    )
}

$jsonContent = $manifest | ConvertTo-Json -Depth 10
Set-Content -Path $manifestPath -Value $jsonContent -Encoding UTF8

Write-Host "Manifest updated successfully!" -ForegroundColor Green
Write-Host "`nManifest content:" -ForegroundColor Cyan
Get-Content $manifestPath | Write-Host

# Step 5: Verify registry entry
Write-Host "`nStep 5: Verifying registry entry..." -ForegroundColor Yellow

$registryPath = "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.ai_form_filler.cli"
if (-not (Test-Path $registryPath)) {
    Write-Host "Creating registry entry..." -ForegroundColor Yellow
    New-Item -Path "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts" -Name "com.ai_form_filler.cli" -Force | Out-Null
}

Set-ItemProperty -Path $registryPath -Name "(Default)" -Value $manifestPath
Write-Host "Registry entry verified!" -ForegroundColor Green

# Step 6: Final instructions
Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Close all Chrome windows" -ForegroundColor White
Write-Host "2. Restart Chrome" -ForegroundColor White
Write-Host "3. Reload your extension at chrome://extensions/" -ForegroundColor White
Write-Host "4. Test the extension - it should now connect to the native messaging host" -ForegroundColor White
Write-Host "`nIf you still see errors, try:" -ForegroundColor Yellow
Write-Host "- Checking Chrome's console (F12) for more details" -ForegroundColor White
Write-Host "- Running Chrome with logging: chrome.exe --enable-logging --v=1" -ForegroundColor White
Write-Host ""
Write-Host "Your extension ID: $extensionId" -ForegroundColor Cyan
Write-Host "Manifest location: $manifestPath" -ForegroundColor Cyan
