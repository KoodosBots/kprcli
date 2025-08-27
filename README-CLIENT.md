# KprCli - Easy Client Deployment

🚀 **One-Command Setup** for KprCli Authentication System

## Quick Start

### Windows Users
```cmd
deploy.bat
```

### Linux/Mac Users  
```bash
./deploy.sh
```

That's it! The system will automatically:
- ✅ Check Docker installation
- ✅ Configure environment
- ✅ Build and start all services
- ✅ Open your browser to http://localhost:3000

## Requirements

1. **Docker Desktop** - [Download here](https://docs.docker.com/get-docker/)
2. **Internet Connection** - For downloading images and dependencies

## Configuration

### Required Services

You'll need accounts with these services (all have free tiers):

1. **Clerk** (Authentication) - [Sign up here](https://clerk.com)
2. **Supabase** (Database) - [Sign up here](https://supabase.com)

### Optional Services

3. **Telegram Bot** (Notifications) - Create via [@BotFather](https://t.me/BotFather)

## Step-by-Step Setup

### 1. Get Your Clerk Keys
1. Go to [Clerk Dashboard](https://clerk.com/dashboard)
2. Create a new application
3. Copy your `Publishable Key` and `Secret Key`

### 2. Get Your Supabase Keys
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to Settings → API
4. Copy your `URL`, `anon key`, and `service_role key`

### 3. Configure Environment
The deployment script will create a `.env` file for you. Edit it with your keys:

```env
# Required - Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here

# Required - Supabase Database  
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here

# Required - Security
JWT_SECRET=your-32-character-secret-here

# Optional - Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 4. Run Deployment
Execute the deployment script and follow the prompts.

## What Gets Deployed

### Core Services
- **Web Interface** (Port 3000) - User dashboard and device authorization
- **Redis** (Port 6379) - Token storage and caching
- **Health Monitoring** - Automatic service health checks

### Features Enabled
- ✅ **Device Authorization** - RFC 8628 compliant OAuth flow for CLI tools
- ✅ **User Management** - Sign up, sign in, user profiles
- ✅ **Telegram Integration** - Bot notifications (optional)
- ✅ **Dashboard** - Real-time user interface
- ✅ **API Endpoints** - Full REST API for integrations

## Usage

### For End Users
1. **Sign Up** - Create account at http://localhost:3000
2. **Generate Device Code** - Use CLI or visit /device endpoint
3. **Authorize Device** - Enter code on web interface
4. **Get Access Token** - CLI can now authenticate

### For Developers
- **API Documentation** - Visit http://localhost:3000/api/health
- **Device Flow** - POST to /api/device/authorize
- **Token Exchange** - POST to /api/device/token

## Management Commands

### View Service Status
```bash
docker-compose -f docker-compose.kprcli.yml ps
```

### View Logs
```bash
docker-compose -f docker-compose.kprcli.yml logs -f
```

### Stop Services
```bash
docker-compose -f docker-compose.kprcli.yml down
```

### Restart Services
```bash
docker-compose -f docker-compose.kprcli.yml restart
```

## Troubleshooting

### Common Issues

**Docker not running**
- Start Docker Desktop
- Wait for it to fully initialize

**Port already in use**
```bash
docker-compose -f docker-compose.kprcli.yml down
```

**Environment variables missing**
- Check your `.env` file
- Ensure all required keys are filled in

**Service won't start**
```bash
docker-compose -f docker-compose.kprcli.yml logs [service-name]
```

### Getting Help

1. **Check Logs** - Service logs contain detailed error information
2. **Verify Configuration** - Ensure all API keys are correct
3. **Test Connectivity** - Make sure you can reach external services
4. **Docker Resources** - Ensure Docker has sufficient memory/disk space

## Security Notes

- ✅ All secrets are stored in environment variables
- ✅ JWT tokens have configurable expiration
- ✅ Database connections use service roles
- ✅ Redis is isolated within Docker network
- ✅ HTTPS ready (configure reverse proxy)

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Web Client    │────│  Next.js Web    │
│  (Browser)      │    │   (Port 3000)   │
└─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │      Redis      │
                       │   (Port 6379)   │
                       └─────────────────┘
                                │
┌─────────────────┐    ┌─────────────────┐
│      CLI        │────│   Device Auth   │
│    Client       │    │   API Endpoints │
└─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Supabase      │
                       │   Database      │
                       └─────────────────┘
```

---

🎉 **That's it!** Your KprCli system is ready for production use.

For support or questions, check the logs or review the configuration.