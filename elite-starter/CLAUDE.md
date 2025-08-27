# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a KprCli authentication system built with Next.js 15, featuring device authorization (RFC 8628), Clerk authentication, Supabase database, and Redis for token storage.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack on http://localhost:3000
- `npm run build` - Build production bundle
- `npm start` - Start production server
- `npm run lint` - Run Next.js linting

### External Services
- **Redis** - Required for device authorization token storage
- **Supabase** - Database for user management and persistence  
- Start Redis locally: `redis-server` (default: localhost:6379)

## Architecture Overview

### Tech Stack
- **Next.js 15** with App Router and Turbopack
- **Supabase** for database and user data persistence
- **Redis** for device authorization token storage and caching
- **Clerk** for authentication and user management
- **TailwindCSS v4** with custom UI components (shadcn/ui)
- **TypeScript** throughout

### Key Architectural Patterns

#### Authentication Flow
1. Clerk handles web authentication via `middleware.ts`
2. Device authorization follows RFC 8628 flow for CLI integration
3. Users are stored in Supabase with Clerk ID as external reference
4. Protected routes redirect unauthenticated users to sign-in

#### Database Architecture
- **Supabase** provides PostgreSQL database with real-time capabilities
- Schema defined in `lib/supabase.ts`:
  - `users` table: User profiles synced from Clerk
  - `automation_jobs` table: AI automation job history
  - `form_patterns` table: User-defined form automation patterns
- CRUD operations via Supabase client

#### Device Authorization (RFC 8628)
1. CLI requests device code from `/api/device/authorize`
2. User visits verification URL and enters user code
3. CLI polls `/api/device/token` until authorized
4. Tokens stored temporarily in Redis with expiration
5. Integration with Telegram bot for notifications

### Project Structure
```
app/
├── (landing)/         # Public landing page components
├── api/
│   ├── device/        # Device authorization endpoints
│   └── auth/          # Clerk user management APIs
├── dashboard/         # Protected dashboard area
├── device/            # Device verification page
├── layout.tsx         # Root layout with ClerkProvider
└── middleware.ts      # Auth protection

components/
├── ui/               # shadcn/ui components
├── device-auth/      # Device authorization UI components
└── telegram/         # Telegram integration components

lib/
├── supabase.ts       # Supabase client and database operations
├── redis.ts          # Redis client and device auth storage
├── auth-bridge-supabase.ts # Auth bridge for Clerk + Supabase
└── utils.ts          # Utility functions
```

## Key Integration Points

### Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY` (for server-side operations)
- `REDIS_URL` (default: redis://localhost:6379)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` (from Clerk dashboard)

### Device Authorization Flow
1. CLI calls `/api/device/authorize` to get device and user codes
2. User visits `/device?user_code=XXXX-XXXX` to authorize
3. CLI polls `/api/device/token` with device_code until approved
4. Tokens stored in Redis with automatic expiration
5. Integration with Telegram bot for notifications

### Database Integration
1. Users created in Supabase when first authenticated via Clerk
2. Authentication bridge manages Clerk ↔ Supabase sync
3. Device authorization tokens stored temporarily in Redis
4. Persistent user data and preferences in Supabase PostgreSQL

### Telegram Bot Integration
1. Webhook endpoint: `/api/telegram/webhook`
2. Commands: `/start`, `/help`, `/link <token>`, `/status`
3. Notifications for device authorization events
4. Account linking via secure tokens
5. Bot token configured via `TELEGRAM_BOT_TOKEN` environment variable

## API Endpoints

### Device Authorization (RFC 8628)
- `POST /api/device/authorize` - Initiate device authorization
- `POST /api/device/token` - Exchange device code for access token
- `GET /api/device/verify?user_code=XXXX` - Get device authorization status
- `POST /api/device/verify` - Authorize device (requires authentication)

### Authentication & User Management
- `GET /api/auth/kprcli-user` - Get current user data
- `PUT /api/auth/kprcli-user` - Update user data
- `POST /api/auth/generate-telegram-token` - Generate Telegram linking token

### Telegram Integration
- `POST /api/telegram/webhook` - Telegram bot webhook handler

## Shadcn Component Installation Rules
When installing shadcn/ui components:
- ALWAYS use `bunx --bun shadcn@latest add [component-name]` instead of `npx`
- If dependency installation fails, manually install with `bun install [dependency-name]`
- Check components.json for existing configuration before installing
- Verify package.json after installation to ensure dependencies were added
- Multiple components can be installed at once: `bunx --bun shadcn@latest add button card drawer`


# Claude Code Configuration

This file contains configuration and rules for working with Claude Code on this project.

## Memory Management Rule

**IMPORTANT**: Always check and update `memory.md` at the start of each session and after completing significant work.

### Process:
1. **Session Start**: Read `memory.md` to understand project history and context
2. **During Work**: Document significant decisions, successful implementations, and key learnings
3. **Session End**: Update `memory.md` with completed work, new patterns, and important discoveries

### Why This Matters:
- Maintains continuity between development sessions
- Preserves successful approaches and technical decisions  
- Prevents repeating failed approaches
- Helps understand project architecture and infrastructure
- Documents deployment patterns and working configurations

## Project-Specific Guidelines

### Docker Environment
- Frontend: `kprcli-ui-dev` container on port 3000
- Backend: `kprcli-api-dev` container on port 8000
- Always verify containers are running with `docker ps`

### File Deployment Pattern
1. Create files locally in project directory
2. Test/validate locally if possible
3. Copy to appropriate container using `docker cp`
4. Verify deployment in container

### Technology Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Python FastAPI 
- **CLI**: Go application
- **Containerization**: Docker with docker-compose

### Design System
- Follow "augment code" branding and visual identity
- Use clean, modern UI patterns
- Maintain consistency with existing components
- Reference screenshots and existing designs

## Commands to Remember

```bash
# Check Docker status
docker ps

# Access container shell
docker exec kprcli-ui-dev sh -c "command"

# Copy files to container
docker cp "local/file" container:/path/to/file

# Check container directory
docker exec kprcli-ui-dev ls -la /app/public/
```

---
*Always consult memory.md for the most up-to-date project context and successful patterns.*