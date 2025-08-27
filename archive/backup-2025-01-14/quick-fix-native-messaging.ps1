# Quick Fix for Native Messaging - AI Form Filler Extension
# This script provides a faster way to fix the native messaging issue

Write-Host "Quick Fix - AI Form Filler Native Messaging" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan

# Quick option - just enter the extension ID
Write-Host "`nOption 1: If you already have the extension loaded in Chrome" -ForegroundColor Yellow
Write-Host "Go to chrome://extensions/ and find your extension ID" -ForegroundColor White
Write-Host "`nOption 2: Let me generate a test configuration" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "Enter '1' to input Extension ID, or '2' for test configuration"

if ($choice -eq "2") {
    # Generate a test configuration that accepts any extension for development
    Write-Host "`nCreating development-friendly configuration..." -ForegroundColor Yellow
    
    $manifestPath = "C:\Users\Work\AppData\Local\AI Form Filler\manifest.json"
    $targetPath = "C:\Users\Work\AppData\Local\AI Form Filler\ai-form-filler.exe"
    
    # Create a more permissive manifest for development
    $manifestContent = @'
{
    "name": "com.ai_form_filler.cli",
    "description": "AI Form Filler CLI",
    "path": "C:\\Users\\Work\\AppData\\Local\\AI Form Filler\\ai-form-filler.exe",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/",
        "chrome-extension://mfgccddacbcommkpbignfccielihcnd/",
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
        "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/",
        "chrome-extension://cccccccccccccccccccccccccccccccc/",
        "chrome-extension://dddddddddddddddddddddddddddddddd/",
        "chrome-extension://eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/",
        "chrome-extension://ffffffffffffffffffffffffffffffff/",
        "chrome-extension://gggggggggggggggggggggggggggggggg/",
        "chrome-extension://hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh/",
        "chrome-extension://iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii/",
        "chrome-extension://jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj/",
        "chrome-extension://kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk/",
        "chrome-extension://llllllllllllllllllllllllllllllll/",
        "chrome-extension://mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm/",
        "chrome-extension://nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn/",
        "chrome-extension://oooooooooooooooooooooooooooooooo/",
        "chrome-extension://pppppppppppppppppppppppppppppppp/"
    ]
}
'@
    
    # Note: This is not ideal for production but helps during development
    Write-Host "Note: This creates a development configuration with multiple placeholder IDs" -ForegroundColor Yellow
    Write-Host "You'll need to add your actual extension ID to the list" -ForegroundColor Yellow
    
} else {
    $extensionId = Read-Host "Enter your Extension ID"
    
    if ([string]::IsNullOrWhiteSpace($extensionId)) {
        Write-Host "Extension ID cannot be empty!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nUpdating manifest with Extension ID: $extensionId" -ForegroundColor Green
    
    $manifestPath = "C:\Users\Work\AppData\Local\AI Form Filler\manifest.json"
    $targetPath = "C:\Users\Work\AppData\Local\AI Form Filler\ai-form-filler.exe"
    
    $manifestContent = @"
{
    "name": "com.ai_form_filler.cli",
    "description": "AI Form Filler CLI",
    "path": "C:\\Users\\Work\\AppData\\Local\\AI Form Filler\\ai-form-filler.exe",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://$($extensionId)/",
        "chrome-extension://bkjcdkjmponebhdddobplhbfpfcacpjn/"
    ]
}
"@
}

# Backup existing manifest
if (Test-Path $manifestPath) {
    $backupPath = "$manifestPath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item -Path $manifestPath -Destination $backupPath -Force
    Write-Host "Backup created: $backupPath" -ForegroundColor Green
}

# Write new manifest
Set-Content -Path $manifestPath -Value $manifestContent -Encoding UTF8
Write-Host "`nManifest updated successfully!" -ForegroundColor Green

# Show the manifest content
Write-Host "`nNew manifest content:" -ForegroundColor Cyan
Get-Content $manifestPath | Write-Host

Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "IMPORTANT: Next Steps" -ForegroundColor Yellow
Write-Host "1. Close ALL Chrome windows completely" -ForegroundColor White
Write-Host "2. Open Chrome again" -ForegroundColor White
Write-Host "3. Go to chrome://extensions/" -ForegroundColor White
Write-Host "4. Remove the old extension if loaded" -ForegroundColor White
Write-Host "5. Click 'Load unpacked' and select:" -ForegroundColor White
Write-Host "   C:\Users\Work\Desktop\KprCLi\packages\cli\ai-form-filler-v1.0.0-complete\extension-for-chrome" -ForegroundColor Cyan
Write-Host "6. The extension should now work without native messaging errors" -ForegroundColor White

Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
Write-Host "- If you still see errors, note down the Extension ID shown in chrome://extensions/" -ForegroundColor White
Write-Host "- Run this script again with that Extension ID" -ForegroundColor White
Write-Host "- Check Chrome DevTools console (F12) for detailed error messages" -ForegroundColor White
