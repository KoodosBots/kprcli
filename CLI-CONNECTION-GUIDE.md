# KprCli CLI User Connection Guide

This guide shows you how to connect CLI users to your KprCli system using Supabase database and device authorization flow.

## Overview

The KprCli CLI enables users to authenticate and interact with your KprCli system through the command line. It uses OAuth 2.0 Device Authorization Grant (RFC 8628) for secure authentication without requiring a web browser redirect.

## Prerequisites

- KprCli Docker deployment running (nginx + web + redis)
- Supabase database properly configured
- Node.js 18+ installed on client machines

## Installation

### For End Users

1. **Download and install the CLI:**
   ```bash
   # Clone the CLI application
   git clone <your-repo>/kprcli-cli
   cd kprcli-cli
   
   # Install dependencies
   npm install
   
   # Build the CLI
   npm run build
   
   # Install globally (optional)
   npm install -g .
   ```

2. **Verify installation:**
   ```bash
   kprcli --help
   ```

## Authentication Flow

### Step 1: Configure Server URL (if not localhost)

```bash
# Set your KprCli server URL
kprcli config server https://your-kprcli-domain.com

# Verify configuration
kprcli config list
```

### Step 2: Login

```bash
# Start authentication flow
kprcli auth login

# Or login without auto-opening browser
kprcli auth login --no-browser
```

The CLI will:
1. Connect to your KprCli server
2. Request a device code
3. Display a verification code and URL
4. Open the URL in your browser (unless --no-browser is used)
5. Wait for you to complete authorization

### Step 3: Complete Web Authorization

1. **Open the verification URL** (automatically or manually)
2. **Sign in** to your KprCli account (using Clerk authentication)
3. **Enter the verification code** shown in the CLI
4. **Authorize the device** when prompted

### Step 4: CLI Authentication Complete

The CLI will automatically:
- Receive the access token
- Store it securely in your user configuration
- Display your user information
- Be ready for authenticated API calls

## Usage Examples

### Check Authentication Status
```bash
kprcli auth status
```

### Check System Status
```bash
kprcli status
kprcli status --verbose  # Detailed information
```

### Configuration Management
```bash
# List all configuration
kprcli config list

# Set specific values
kprcli config set log_level debug
kprcli config set auto_open_browser false

# Get specific value
kprcli config get server_url

# Show config file location
kprcli config path
```

### Logout
```bash
kprcli auth logout
```

## Configuration File Locations

The CLI stores configuration in standard system locations:

- **Windows**: `%USERPROFILE%\.kprcli\config.json`
- **macOS**: `~/.kprcli/config.json`
- **Linux**: `~/.kprcli/config.json`

## Security Features

### Token Management
- Access tokens are stored securely in user configuration
- Tokens have limited lifetime (1 hour by default)
- Refresh tokens valid for 30 days
- Automatic token refresh when needed

### Device Authorization Benefits
- No need for web browser redirects
- Secure for headless environments
- Works well with CI/CD systems
- User maintains control over device authorization

## Troubleshooting

### Authentication Issues

**Problem**: "Not authenticated" errors
```bash
# Solution: Re-authenticate
kprcli auth logout
kprcli auth login
```

**Problem**: "Server unreachable" errors
```bash
# Check server status
kprcli status

# Verify server URL
kprcli config get server_url

# Test server manually
curl http://your-server/api/health
```

### Configuration Issues

**Problem**: Configuration seems corrupted
```bash
# Reset to defaults
kprcli config reset

# Show config file location
kprcli config path

# Manually edit/delete config file if needed
```

### Network Issues

**Problem**: Timeout during authentication
- Check firewall settings
- Verify server is accessible
- Ensure nginx is properly configured
- Check if device authorization endpoints are working

## API Integration

Once authenticated, the CLI can make authenticated requests to your KprCli API:

```bash
# Example: Check user information
curl -H "Authorization: Bearer $(kprcli auth token)" http://localhost/api/auth/kprcli-user
```

## Development and Customization

### Building Custom Commands

The CLI is built with TypeScript and Commander.js. You can extend it by:

1. Adding new command files in `src/commands/`
2. Implementing the command class with `getCommand()` method
3. Registering the command in `src/index.ts`
4. Rebuilding with `npm run build`

### Environment-Specific Configuration

For different environments, you can:

```bash
# Development
kprcli config server http://localhost

# Staging  
kprcli config server https://staging.your-domain.com

# Production
kprcli config server https://your-domain.com
```

## Server-Side Requirements

### Environment Variables

Ensure your KprCli server has:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key  
SUPABASE_SERVICE_KEY=your_service_key

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost  # or your domain
JWT_SECRET=your_jwt_secret

# Redis (for token storage)
REDIS_URL=redis://redis:6379
```

### Database Schema

The Supabase database should have the required tables:
- `users` - User profiles linked to Clerk
- `automation_jobs` - User automation history
- `form_patterns` - User-defined form patterns

### API Endpoints

Required endpoints for CLI authentication:
- `POST /api/device/authorize` - Initiate device authorization
- `POST /api/device/token` - Exchange device code for access token
- `GET /api/device/verify` - Check device authorization status
- `POST /api/device/verify` - Complete device authorization

## Support

For issues with CLI connection:

1. **Check system status**: `kprcli status --verbose`
2. **Verify server health**: Visit `http://your-server/api/health`
3. **Check configuration**: `kprcli config list`
4. **Review logs**: Enable debug logging with `kprcli config set log_level debug`

Common solutions:
- Ensure Docker deployment is running properly
- Verify nginx is proxying requests correctly
- Check that Supabase and Redis are accessible
- Confirm environment variables are set correctly

## Next Steps

Once CLI users are connected, they can:
- Access authenticated API endpoints
- Run form automation jobs
- Manage their user profiles
- Monitor system status
- Configure preferences

The CLI provides the foundation for building additional commands and automation workflows specific to your KprCli use cases.