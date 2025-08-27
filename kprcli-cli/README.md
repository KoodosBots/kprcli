# KprCli - Command Line Interface

A powerful CLI tool for KprCli form automation and device authorization.

## Installation

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Install globally (optional)
npm install -g .
```

## Usage

### Authentication

```bash
# Login to KprCli server
kprcli auth login

# Check authentication status
kprcli auth status

# Logout
kprcli auth logout
```

### Configuration

```bash
# Show current configuration
kprcli config list

# Set server URL
kprcli config server https://your-kprcli-server.com

# Set configuration values
kprcli config set auto_open_browser true
kprcli config set log_level debug

# Get configuration value
kprcli config get server_url
```

### System Status

```bash
# Check system status
kprcli status

# Detailed status information
kprcli status --verbose
```

### Other Commands

```bash
# Show version information
kprcli version

# Show help
kprcli --help
```

## Authentication Flow

The CLI uses OAuth 2.0 Device Authorization Grant (RFC 8628) for secure authentication:

1. Run `kprcli auth login`
2. The CLI will display a user code and verification URL
3. Open the URL in your browser (or it opens automatically)
4. Enter the user code to authorize the device
5. The CLI will automatically receive and store your access tokens

## Configuration

Configuration is stored in your system's standard configuration directory:

- **Windows**: `%APPDATA%\\kprcli\\config.json`
- **macOS**: `~/Library/Preferences/kprcli/config.json`
- **Linux**: `~/.config/kprcli/config.json`

### Configuration Options

- `server_url`: KprCli server URL (default: http://localhost)
- `auto_open_browser`: Automatically open browser for authentication (default: true)
- `log_level`: Logging level (debug, info, warn, error)

## Security

- Access tokens are stored securely in your system's configuration directory
- Tokens have limited lifetime and will be refreshed automatically
- Use `kprcli auth logout` to clear stored credentials

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Troubleshooting

### Authentication Issues

If authentication fails:

1. Check server connectivity: `kprcli status`
2. Verify server URL: `kprcli config get server_url`
3. Check if server is running: `curl http://your-server/api/health`
4. Clear configuration and re-authenticate: `kprcli config reset && kprcli auth login`

### Configuration Issues

To reset all configuration:

```bash
kprcli config reset
```

To view configuration file location:

```bash
kprcli config path
```

## Support

For support and bug reports, please visit: [KprCli Issues](https://github.com/your-org/kprcli/issues)