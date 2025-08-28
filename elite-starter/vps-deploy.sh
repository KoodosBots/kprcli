#!/bin/bash

# KprCli VPS Deployment Script
# Run this on your VPS (82.25.90.200) after SSH login as root

set -e

echo "🚀 KprCli VPS Deployment Script"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${GREEN}Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}Step 2: Installing Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo -e "${GREEN}Step 3: Installing required packages...${NC}"
apt install -y build-essential git nginx redis-server certbot python3-certbot-nginx ufw

echo -e "${GREEN}Step 4: Installing PM2 globally...${NC}"
npm install -g pm2

echo -e "${GREEN}Step 5: Starting Redis...${NC}"
systemctl enable redis-server
systemctl start redis-server

echo -e "${GREEN}Step 6: Cloning KprCli repository...${NC}"
cd /var/www
if [ -d "kprcli" ]; then
    echo -e "${YELLOW}Repository already exists, pulling latest...${NC}"
    cd kprcli && git pull origin main
else
    git clone https://github.com/KoodosBots/kprcli.git
fi

cd /var/www/kprcli

echo -e "${GREEN}Step 7: Setting up Next.js application...${NC}"
cd elite-starter

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Create production environment file
echo -e "${BLUE}Setting up environment variables...${NC}"
if [ ! -f .env.local ]; then
    cp .env.production .env.local
    echo -e "${YELLOW}IMPORTANT: Edit /var/www/kprcli/elite-starter/.env.local with your production values${NC}"
    echo "Required variables:"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_KEY"
    echo "  - REDIS_URL=redis://localhost:6379"
    echo "  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    echo "  - CLERK_SECRET_KEY"
    echo "  - TELEGRAM_BOT_TOKEN"
    echo ""
    echo "Press Enter after editing environment file..."
    read -r
fi

# Build the application
echo -e "${BLUE}Building Next.js application...${NC}"
npm run build

echo -e "${GREEN}Step 8: Setting up Telegram bot...${NC}"
cd ../TeleKprV2
if [ ! -f .env ]; then
    echo "KPRCLI_APP_URL=https://app.kprcli.com" > .env
    echo -e "${YELLOW}Add your other bot environment variables to /var/www/kprcli/TeleKprV2/.env${NC}"
fi
npm install

echo -e "${GREEN}Step 9: Creating PM2 ecosystem configuration...${NC}"
cd /var/www/kprcli
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'kprcli-app',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/kprcli/elite-starter',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/kprcli-app-error.log',
      out_file: '/var/log/pm2/kprcli-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'kprcli-bot',
      script: './bot.js',
      cwd: '/var/www/kprcli/TeleKprV2',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        KPRCLI_APP_URL: 'https://app.kprcli.com'
      },
      error_file: '/var/log/pm2/kprcli-bot-error.log',
      out_file: '/var/log/pm2/kprcli-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}
EOF

echo -e "${GREEN}Step 10: Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/app.kprcli.com << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name app.kprcli.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.kprcli.com;

    # SSL configuration will be added by certbot
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Main proxy to Next.js
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
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Next.js static assets with caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 60m;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo -e "${GREEN}Step 11: Enabling Nginx site...${NC}"
ln -sf /etc/nginx/sites-available/app.kprcli.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo -e "${GREEN}✅ Nginx configured successfully${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

echo -e "${GREEN}Step 12: Setting up firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp  
ufw allow 443/tcp
ufw --force enable

echo -e "${GREEN}Step 13: Starting applications with PM2...${NC}"
# Create log directory
mkdir -p /var/log/pm2

# Start applications
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo -e "${GREEN}Step 14: Setting up SSL certificate...${NC}"
echo "Please enter your email for Let's Encrypt SSL certificate:"
read -r EMAIL

if [ -n "$EMAIL" ]; then
    certbot --nginx -d app.kprcli.com --non-interactive --agree-tos --email "$EMAIL"
    systemctl enable certbot.timer
    echo -e "${GREEN}✅ SSL certificate installed${NC}"
else
    echo -e "${YELLOW}SSL setup skipped. Run later with: certbot --nginx -d app.kprcli.com${NC}"
fi

echo -e "${GREEN}Step 15: Creating management aliases...${NC}"
cat >> ~/.bashrc << 'EOF'

# KprCli management aliases
alias kprcli-status='pm2 status'
alias kprcli-logs='pm2 logs kprcli-app'
alias kprcli-bot-logs='pm2 logs kprcli-bot'
alias kprcli-restart-app='pm2 restart kprcli-app'
alias kprcli-restart-bot='pm2 restart kprcli-bot'
alias kprcli-restart-all='pm2 restart all'
alias kprcli-monit='pm2 monit'
alias kprcli-health='curl -s https://app.kprcli.com/api/health || echo "Health check failed"'
EOF

source ~/.bashrc

echo -e "${GREEN}✅ KprCli VPS Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Status:${NC}"
echo "🌐 Domain: https://app.kprcli.com"
echo "🖥️  Next.js App: Port 3000 (behind nginx)"
echo "🤖 Telegram Bot: PM2 managed"
echo "🍃 Redis: Running on port 6379"
echo "🔒 SSL: Let's Encrypt certificate"
echo ""
echo -e "${YELLOW}📝 Management Commands:${NC}"
echo "  kprcli-status        - View PM2 status"
echo "  kprcli-logs          - View app logs"
echo "  kprcli-bot-logs      - View bot logs"
echo "  kprcli-restart-app   - Restart Next.js app"
echo "  kprcli-restart-bot   - Restart Telegram bot"
echo "  kprcli-restart-all   - Restart all services"
echo "  kprcli-monit         - PM2 monitoring dashboard"
echo "  kprcli-health        - Test app health endpoint"
echo ""
echo -e "${YELLOW}🔧 Important Next Steps:${NC}"
echo "1. Edit environment variables:"
echo "   nano /var/www/kprcli/elite-starter/.env.local"
echo "2. Restart after env changes:"
echo "   pm2 restart kprcli-app"
echo "3. Test the deployment:"
echo "   curl https://app.kprcli.com/api/health"
echo "4. Monitor logs:"
echo "   pm2 logs"
echo ""
echo -e "${GREEN}🎉 Your KprCli system is now running on VPS!${NC}"

# Create a quick health check script
cat > /usr/local/bin/kprcli-health-check << 'EOF'
#!/bin/bash
echo "🔍 KprCli System Health Check"
echo "============================"
echo ""
echo "📊 PM2 Status:"
pm2 jlist | jq -r '.[] | "\(.name): \(.pm2_env.status)"' 2>/dev/null || pm2 list
echo ""
echo "🌐 Nginx Status:"
systemctl status nginx --no-pager | head -3
echo ""
echo "🔴 Redis Status:"
redis-cli ping 2>/dev/null && echo "Redis: ✅ OK" || echo "Redis: ❌ FAILED"
echo ""
echo "💾 Disk Usage:"
df -h | grep -E '/dev/|Filesystem' | head -2
echo ""
echo "🧠 Memory Usage:"
free -h
echo ""
echo "🔗 App Health:"
curl -s -w "HTTP %{http_code} - %{time_total}s\n" https://app.kprcli.com/api/health 2>/dev/null || echo "❌ Health endpoint not accessible"
echo ""
echo "🤖 Bot Status:"
if pm2 jlist | grep -q "kprcli-bot"; then
    echo "✅ Bot is running"
else
    echo "❌ Bot is not running"
fi
EOF

chmod +x /usr/local/bin/kprcli-health-check

echo ""
echo -e "${BLUE}Run 'kprcli-health-check' anytime to check system status${NC}"