# AI Form Filler CLI Installation

## What's Included
- ai-form-filler.exe - The CLI application
- install.ps1 - Installation script
- uninstall.ps1 - Uninstallation script

## Installation Instructions

1. **Download** this folder to your computer
2. **Right-click** on PowerShell and select "Run as Administrator"
3. **Navigate** to this folder in PowerShell
4. **Run** the installer:
   `
   .\install.ps1
   `
5. **Install** the browser extension from the Chrome Web Store

## What the Installer Does
- Installs the CLI to Program Files
- Configures native messaging for Chrome
- Sets up proper permissions and registry entries

## Uninstalling
Run the uninstaller as Administrator:
`
.\uninstall.ps1
`

## Troubleshooting
- Make sure you run PowerShell as Administrator
- Ensure Chrome is closed during installation
- If you get execution policy errors, run:
  `
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  `

## Support
For support, visit: [Your support URL]
Version: 1.0.0
