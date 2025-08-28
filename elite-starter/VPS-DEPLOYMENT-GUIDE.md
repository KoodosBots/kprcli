# KprCli VPS Deployment Guide

## Quick Deployment Instructions

### Step 1: Connect to Your VPS

SSH into your Hostinger VPS:
```bash
ssh root@82.25.90.200
```

### Step 2: Download and Run Deployment Script

```bash
# Download the deployment script
curl -o vps-deploy.sh https://raw.githubusercontent.com/KoodosBots/kprcli/main/elite-starter/vps-deploy.sh

# Make it executable
chmod +x vps-deploy.sh

# Run the deployment
./vps-deploy.sh
```

**OR** if you prefer to copy the script manually:

```bash
# Create the script
nano vps-deploy.sh
# Paste the script content and save (Ctrl+X, then Y, then Enter)

# Make executable and run
chmod +x vps-deploy.sh
./vps-deploy.sh
```

### Step 3: Configure Environment Variables

The script will prompt you to edit environment variables. You'll need:

1. **Supabase Configuration:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   ```

2. **Clerk Authentication:**
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   ```

3. **Redis Configuration:**
   ```
   REDIS_URL=redis://localhost:6379
   ```

4. **Telegram Bot:**
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```

### Step 4: Verify Deployment

After the script completes, test your deployment:

```bash
# Check PM2 status
pm2 status

# Test the application
curl https://app.kprcli.com/api/health

# Check logs
pm2 logs kprcli-app

# Run health check
kprcli-health-check
```

## Management Commands

Once deployed, you can use these commands:

```bash
# View application status
kprcli-status

# View application logs
kprcli-logs

# View bot logs  
kprcli-bot-logs

# Restart applications
kprcli-restart-app    # Restart Next.js app
kprcli-restart-bot    # Restart Telegram bot
kprcli-restart-all    # Restart everything

# Monitor in real-time
kprcli-monit

# Check system health
kprcli-health-check

# Test app health endpoint
kprcli-health
```

## File Locations

- **Application:** `/var/www/kprcli/elite-starter/`
- **Bot:** `/var/www/kprcli/TeleKprV2/`
- **Environment:** `/var/www/kprcli/elite-starter/.env.local`
- **Bot Environment:** `/var/www/kprcli/TeleKprV2/.env`
- **Nginx Config:** `/etc/nginx/sites-available/app.kprcli.com`
- **PM2 Config:** `/var/www/kprcli/ecosystem.config.js`
- **Logs:** `/var/log/pm2/`

## Troubleshooting

### 1. Application Not Starting
```bash
# Check PM2 logs
pm2 logs kprcli-app

# Check if build was successful
cd /var/www/kprcli/elite-starter
ls -la .next/

# Rebuild if needed
npm run build
pm2 restart kprcli-app
```

### 2. SSL Certificate Issues
```bash
# Manual SSL setup
certbot --nginx -d app.kprcli.com

# Check certificate status
certbot certificates
```

### 3. Nginx Issues
```bash
# Test nginx configuration
nginx -t

# Check nginx status
systemctl status nginx

# Restart nginx
systemctl restart nginx
```

### 4. Redis Connection Issues
```bash
# Check Redis status
systemctl status redis-server

# Test Redis connection
redis-cli ping

# Restart Redis
systemctl restart redis-server
```

### 5. Bot Not Working
```bash
# Check bot logs
pm2 logs kprcli-bot

# Check bot environment
cat /var/www/kprcli/TeleKprV2/.env

# Restart bot
pm2 restart kprcli-bot
```

## Environment File Template

Create `/var/www/kprcli/elite-starter/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your_key_here
CLERK_SECRET_KEY=sk_live_your_key_here

# Redis
REDIS_URL=redis://localhost:6379

# App Configuration
NEXT_PUBLIC_APP_URL=https://app.kprcli.com

# Telegram (if using bot)
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

## DNS Verification

Before running the script, verify DNS is pointing correctly:

```bash
# Check DNS resolution
nslookup app.kprcli.com

# Should return: 82.25.90.200
```

## Support

If you encounter issues:

1. Check the logs: `pm2 logs`
2. Run health check: `kprcli-health-check`
3. Verify environment variables are set correctly
4. Check nginx configuration: `nginx -t`
5. Verify all services are running: `pm2 status`

---

**Your KprCli system will be available at: https://app.kprcli.com**