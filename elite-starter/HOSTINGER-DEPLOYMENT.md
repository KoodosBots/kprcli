# Hostinger Deployment Guide for KprCli

## Hostinger Hosting Options

### Option 1: VPS Hosting (Recommended for Full Control)

If you have a Hostinger VPS, you can deploy the entire stack:

#### Step 1: Connect to VPS
```bash
ssh root@your-vps-ip
```

#### Step 2: Install Required Software
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2
npm install -g pm2

# Install Redis
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install nginx
apt install -y nginx
```

#### Step 3: Clone and Setup Application
```bash
# Clone your repository
git clone https://github.com/yourusername/kprcli.git /var/www/kprcli
cd /var/www/kprcli/elite-starter

# Install dependencies
npm install

# Build the application
npm run build

# Copy production environment
cp .env.production .env.local
# Edit .env.local to set production values
nano .env.local
```

#### Step 4: Configure PM2
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'kprcli-app',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/kprcli/elite-starter',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Step 5: Configure Nginx
```bash
# Create nginx configuration
cat > /etc/nginx/sites-available/app.kprcli.com << 'EOF'
server {
    listen 80;
    server_name app.kprcli.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/app.kprcli.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### Step 6: Setup SSL with Let's Encrypt
```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d app.kprcli.com --non-interactive --agree-tos --email your-email@example.com

# Auto-renewal
systemctl enable certbot.timer
```

### Option 2: Cloud Hosting (Shared/Business)

If you have Hostinger Cloud/Business hosting with Node.js support:

#### Step 1: Access hPanel
1. Log in to your Hostinger account
2. Go to Hosting → Manage → Advanced → Node.js

#### Step 2: Create Node.js Application
1. Click "Create Application"
2. Set:
   - Node.js version: 20.x
   - Application mode: Production
   - Application root: public_html/kprcli
   - Application URL: app.kprcli.com
   - Application startup file: node_modules/.bin/next start

#### Step 3: Upload Files via File Manager or Git
```bash
# If Git is available in hPanel Terminal
cd ~/public_html
git clone https://github.com/yourusername/kprcli.git
cd kprcli/elite-starter
npm install
npm run build
```

#### Step 4: Environment Variables in hPanel
In Node.js configuration, add environment variables:
```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.kprcli.com
REDIS_URL=redis://your-redis-service
# Add all other variables from .env.production
```

#### Step 5: Start Application
Click "Start" in the Node.js application manager

### Option 3: Static Export (Limited Functionality)

If you only have basic hosting, you can export as static:

#### Update next.config.ts:
```typescript
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  }
}
```

#### Build and Export:
```bash
npm run build
# Upload the 'out' directory contents to public_html
```

**Note**: This disables API routes and dynamic features!

## DNS Configuration in Hostinger

### In hPanel DNS Zone:
```
Type    Name    Value                   TTL
A       app     YOUR_SERVER_IP         14400
AAAA    app     YOUR_IPV6 (optional)   14400
```

### For Cloudflare (Recommended):
1. Add domain to Cloudflare
2. Update nameservers in Hostinger
3. In Cloudflare, add:
```
Type    Name    Content         Proxy
A       app     YOUR_SERVER_IP  Proxied (Orange Cloud)
```

## Telegram Bot Deployment

Deploy the bot on the same VPS:

```bash
cd /var/www/kprcli/TeleKprV2

# Install dependencies
npm install

# Update .env
echo "KPRCLI_APP_URL=https://app.kprcli.com" >> .env

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

## External Redis Options

Since Hostinger doesn't provide Redis:

### 1. Upstash (Recommended)
- Sign up at upstash.com (free tier available)
- Create Redis database
- Copy connection string to REDIS_URL

### 2. Redis Cloud
- Sign up at redis.com
- Create free database (30MB)
- Use connection string

### 3. Railway Redis
- Create Redis service on Railway
- Use public URL in your Hostinger app

## Environment Variables for Production

```env
# Update these in your Hostinger deployment
NEXT_PUBLIC_APP_URL=https://app.kprcli.com
NODE_ENV=production

# Use external Redis service
REDIS_URL=redis://default:password@redis-provider.com:6379

# Keep your existing Supabase config
NEXT_PUBLIC_SUPABASE_URL=https://bzezkjlrdereyoozeicz.supabase.co
SUPABASE_SERVICE_KEY=your-key

# Update Telegram bot
KPRCLI_APP_URL=https://app.kprcli.com
```

## Monitoring

### For VPS:
```bash
# Check application status
pm2 status
pm2 logs kprcli-app

# Monitor resources
htop
df -h
```

### For Cloud Hosting:
- Use hPanel's Resource Usage
- Check Node.js logs in hPanel

## Troubleshooting

### Port Issues
If port 3000 is blocked, change in ecosystem.config.js:
```javascript
env: {
  PORT: 8080  // or another available port
}
```

### Memory Issues
Add to ecosystem.config.js:
```javascript
max_memory_restart: '1G',
instances: 1,
exec_mode: 'fork'
```

### SSL Issues
Force HTTPS redirect in nginx:
```nginx
server {
    listen 80;
    server_name app.kprcli.com;
    return 301 https://$server_name$request_uri;
}
```

## Support Links
- Hostinger VPS Guide: https://support.hostinger.com/en/articles/4543520
- Node.js on Hostinger: https://support.hostinger.com/en/articles/5232113
- Hostinger API: https://support.hostinger.com/en/articles/6584509