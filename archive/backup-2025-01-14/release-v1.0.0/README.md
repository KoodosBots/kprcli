# AI Form Filler v1.0.0

## Installation Instructions

### Installation Options

**Option 1: System Installation (Recommended)**
1. **Right-click `install.bat`** and select "Run as administrator"
2. **Follow the prompts** - installs to Program Files
3. **Install the browser extension** from Chrome Web Store

**Option 2: User Installation (No Admin Required)**
1. **Double-click `install-user.bat`** (no admin needed)
2. **Follow the prompts** - installs to your user directory
3. **Install the browser extension** from Chrome Web Store

**Option 3: Having Problems?**
1. **Run `troubleshoot.bat`** to diagnose issues
2. **Try the user installer** if system installer fails
3. **Check antivirus settings** - may block installation

## What's Included

- `ai-form-filler.exe` - Main CLI application
- `install.bat` - System installer (requires admin rights) **← Recommended**
- `install-user.bat` - User installer (no admin required) **← Try this if install.bat fails**
- `install.ps1` - PowerShell installer (alternative)
- `uninstall.bat` - Complete removal tool
- `troubleshoot.bat` - Diagnose installation issues
- `README.md` - This documentation
- `extension-for-chrome/` - Browser extension folder (load in Chrome)
- `ai-form-filler-extension-v1.0.0.zip` - Extension ZIP for Chrome Web Store
- `EXTENSION-INSTALL.md` - Detailed extension installation guide

## How It Works

The AI Form Filler uses a hybrid architecture:

- **Browser Extension**: Detects forms and provides UI
- **CLI Application**: Handles automation, profiles, and advanced features
- **Native Messaging**: Secure communication between extension and CLI

## System Requirements

- Windows 10/11 (64-bit)
- Google Chrome (latest version)
- Administrator privileges for installation

## Quick Start

1. **Install CLI**: Run `install-user.bat` (or `install.bat` as admin)
2. **Install Extension**: See `EXTENSION-INSTALL.md` for detailed instructions
   - Open Chrome → `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked" → Select `extension-for-chrome` folder
3. **Test**: Click extension icon in Chrome toolbar
4. **Create Profile**: Fill in your information
5. **Fill Forms**: Navigate to any form and use the extension!
3. Open any web form
4. Click the extension icon
5. Create a profile and fill forms automatically!

## Support

- **GitHub**: https://github.com/your-repo/ai-form-filler
- **Issues**: Report bugs and request features
- **Documentation**: Full guides and API reference

## Version Information

- **Version**: 1.0.0
- **Architecture**: Hybrid (Extension + CLI)
- **Platform**: Windows
- **Build Date**: August 2025