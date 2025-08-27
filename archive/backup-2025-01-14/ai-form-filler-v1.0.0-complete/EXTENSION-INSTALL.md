# How to Install the AI Form Filler Extension

## Method 1: Load Unpacked Extension (For Testing)

1. **Open Chrome** and go to `chrome://extensions/`
2. **Enable Developer Mode** (toggle in top-right corner)
3. **Click "Load unpacked"**
4. **Select the `extension-for-chrome` folder** from this package
5. **Done!** The extension should now appear in your extensions list

## Method 2: Install from Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store once published.

## Troubleshooting

### "Manifest file is missing or unreadable"
- Make sure you selected the `extension-for-chrome` folder, not a ZIP file
- The folder should contain `manifest.json` and other extension files
- Try refreshing the extensions page and loading again

### Extension doesn't appear
- Check that Developer Mode is enabled
- Look for any error messages in the extensions page
- Make sure Chrome is up to date

### Native messaging not working
- Make sure you've run the CLI installer first (`install.bat` or `install-user.bat`)
- Check that the CLI is properly installed by running `troubleshoot.bat`
- Restart Chrome after installing the CLI

## Files in extension-for-chrome folder:
- `manifest.json` - Extension configuration
- `background.js` - Background service worker
- `content.js` - Content script for web pages
- `popup.html` - Extension popup interface
- `popup-simple.js` - Popup functionality
- `injected.js` - Page injection script
- `icons/` - Extension icons

## Next Steps

1. Install the CLI first (run `install-user.bat`)
2. Load the extension using Method 1 above
3. Click the extension icon in Chrome toolbar
4. Create your first profile and start filling forms!