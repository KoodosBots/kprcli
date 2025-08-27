# Native Messaging Host Setup

This directory contains the configuration and installation scripts for the AI Form Filler native messaging host, which enables communication between the browser extension and the CLI application.

## Overview

Native messaging allows the browser extension to communicate with the CLI application running on the user's system. This enables features like:

- Profile management through the CLI
- Form training and analysis
- Automated form filling with AI assistance
- Real-time status updates

## Installation

### Prerequisites

1. Build the CLI application:
   ```bash
   cd packages/cli
   go build -o ai-form-filler-cli
   ```

2. Build the browser extension:
   ```bash
   cd packages/extension
   npm run build
   ```

### Linux/macOS

Run the installation script:
```bash
cd packages/extension/scripts
./install-native-host.sh
```

### Windows

Run the installation script:
```cmd
cd packages\extension\scripts
install-native-host.bat
```

## Configuration

After installation, you need to update the native messaging host manifest with the actual extension ID:

1. Install the extension in Chrome and note the extension ID
2. Update the manifest file:
   - Linux/macOS: `~/.config/google-chrome/NativeMessagingHosts/com.ai_form_filler.cli.json`
   - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\com.ai_form_filler.cli.json`
3. Replace `EXTENSION_ID_PLACEHOLDER` with your actual extension ID

## Testing

To test the native messaging connection:

1. Open Chrome Developer Tools
2. Go to the extension popup
3. Check the console for connection messages
4. Try creating a profile or checking status

## Troubleshooting

### Connection Issues

1. **"Native messaging not available"**
   - Ensure the CLI binary is built and executable
   - Check that the manifest file exists and has correct paths
   - Verify the extension ID in the manifest matches your installed extension

2. **"Native messaging disconnected"**
   - Check CLI logs for errors
   - Ensure the CLI has necessary permissions
   - Try rebuilding the CLI binary

3. **Permission Denied**
   - Make sure the CLI binary is executable (`chmod +x` on Linux/macOS)
   - Check file permissions on the manifest file

### Debug Mode

Run the CLI in debug mode to see detailed logs:
```bash
./ai-form-filler-cli native-messaging --debug
```

## Security Considerations

- The native messaging host only accepts connections from the specified extension ID
- All communication is local to the user's machine
- Profile data is stored locally and encrypted
- The CLI runs with user permissions only

## File Locations

### Manifest Files
- **Linux Chrome**: `~/.config/google-chrome/NativeMessagingHosts/com.ai_form_filler.cli.json`
- **Linux Chromium**: `~/.config/chromium/NativeMessagingHosts/com.ai_form_filler.cli.json`
- **macOS Chrome**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ai_form_filler.cli.json`
- **macOS Chromium**: `~/Library/Application Support/Chromium/NativeMessagingHosts/com.ai_form_filler.cli.json`
- **Windows Chrome**: `%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\com.ai_form_filler.cli.json`

### CLI Binary
- Default location: `packages/cli/ai-form-filler-cli` (or `.exe` on Windows)
- Can be moved to any location, update manifest path accordingly

## Message Protocol

The extension and CLI communicate using JSON messages with the following structure:

```json
{
  "id": "unique_request_id",
  "type": "MESSAGE_TYPE",
  "data": { ... },
  "success": true,
  "error": "error_message_if_any"
}
```

### Supported Message Types

- `HANDSHAKE`: Initial connection setup
- `GET_PROFILES`: Retrieve user profiles
- `CREATE_PROFILE`: Create new profile
- `UPDATE_PROFILE`: Update existing profile
- `DELETE_PROFILE`: Delete profile
- `FILL_FORM`: Fill form with profile data
- `TRAIN_FORM`: Train AI on form structure
- `GET_STATUS`: Get CLI status
- `OPEN_CLI_DASHBOARD`: Open CLI dashboard

## Development

To modify the native messaging implementation:

1. Update handlers in `packages/cli/internal/messaging/handlers.go`
2. Add new message types in `packages/cli/internal/messaging/native_host.go`
3. Update the extension background script to handle new message types
4. Test thoroughly with debug mode enabled