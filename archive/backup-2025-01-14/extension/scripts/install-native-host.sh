#!/bin/bash

# Install script for AI Form Filler native messaging host
# This script installs the native messaging host manifest for Chrome/Chromium

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(dirname "$SCRIPT_DIR")"
CLI_PATH="${EXTENSION_DIR}/../../cli/ai-form-filler-cli"

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*)    MACHINE=Cygwin;;
    MINGW*)     MACHINE=MinGw;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: $MACHINE"

# Set paths based on OS
if [ "$MACHINE" = "Linux" ]; then
    CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
elif [ "$MACHINE" = "Mac" ]; then
    CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    CHROMIUM_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
else
    echo "Unsupported OS: $MACHINE"
    exit 1
fi

# Create directories if they don't exist
mkdir -p "$CHROME_DIR"
mkdir -p "$CHROMIUM_DIR"

# Check if CLI binary exists
if [ ! -f "$CLI_PATH" ]; then
    echo "CLI binary not found at $CLI_PATH"
    echo "Please build the CLI first with: cd packages/cli && go build -o ai-form-filler-cli"
    exit 1
fi

# Make CLI binary executable
chmod +x "$CLI_PATH"

# Create native messaging host manifest
MANIFEST_CONTENT=$(cat << EOF
{
  "name": "com.ai_form_filler.cli",
  "description": "AI Form Filler CLI Native Messaging Host",
  "path": "$CLI_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID_PLACEHOLDER/"
  ]
}
EOF
)

# Install manifest for Chrome
echo "$MANIFEST_CONTENT" > "$CHROME_DIR/com.ai_form_filler.cli.json"
echo "Installed native messaging host manifest for Chrome at: $CHROME_DIR/com.ai_form_filler.cli.json"

# Install manifest for Chromium
echo "$MANIFEST_CONTENT" > "$CHROMIUM_DIR/com.ai_form_filler.cli.json"
echo "Installed native messaging host manifest for Chromium at: $CHROMIUM_DIR/com.ai_form_filler.cli.json"

echo ""
echo "Native messaging host installation completed!"
echo ""
echo "Next steps:"
echo "1. Build and install the Chrome extension"
echo "2. Update the manifest files with the actual extension ID"
echo "3. Test the connection between extension and CLI"
echo ""
echo "To update the extension ID, run:"
echo "  sed -i 's/EXTENSION_ID_PLACEHOLDER/YOUR_ACTUAL_EXTENSION_ID/g' \"$CHROME_DIR/com.ai_form_filler.cli.json\""
echo "  sed -i 's/EXTENSION_ID_PLACEHOLDER/YOUR_ACTUAL_EXTENSION_ID/g' \"$CHROMIUM_DIR/com.ai_form_filler.cli.json\""