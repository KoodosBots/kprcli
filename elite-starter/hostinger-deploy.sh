#!/bin/bash

# Hostinger VPS Deployment Script for KprCli
# Run this on your Hostinger VPS after SSH login

set -e

echo "🚀 KprCli Hostinger VPS Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

echo -e "${GREEN}Step 3: Installing build essentials...${NC}"
apt install -y build-essential git nginx redis-server certbot python3-certbot-nginx

echo -e "${GREEN}Step 4: Installing PM2...${NC}"
npm install -g pm2

echo -e "${GREEN}Step 5: Starting Redis...${NC}"
systemctl enable redis-server
systemctl start redis-server

echo -e "${GREEN}Step 6: Creating application directory...${NC}"
mkdir -p /var/www/kprcli

echo -e "${YELLOW}Step 7: Clone your repository${NC}"
echo "Please enter your GitHub repository URL (e.g., https://github.com/username/kprcli):"
read -r REPO_URL

if [ -z "$REPO_URL" ]; then
    echo -e "${RED}Repository URL is required!${NC}"
    exit 1
fi

cd /var/www
git clone "$REPO_URL" kprcli || {
    echo -e "${YELLOW}Repository already exists, pulling latest...${NC}"
    cd kprcli && git pull
}

echo -e "${GREEN}Step 8: Setting up Next.js application...${NC}"
cd /var/www/kprcli/elite-starter
npm install
npm run build

echo -e "${GREEN}Step 9: Creating PM2 ecosystem file...${NC}"
cat > /var/www/kprcli/ecosystem.config.js << 'EOF'
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
      error_file: '/var/log/pm2/kprcli-error.log',
      out_file: '/var/log/pm2/kprcli-out.log',
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
      error_file: '/var/log/pm2/bot-error.log',
      out_file: '/var/log/pm2/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}
EOF

echo -e "${GREEN}Step 10: Creating environment file...${NC}"
echo -e "${YELLOW}Creating .env.local from .env.production template${NC}"
cp /var/www/kprcli/elite-starter/.env.production /var/www/kprcli/elite-starter/.env.local

echo -e "${YELLOW}Please edit /var/www/kprcli/elite-starter/.env.local to add your production values${NC}"
echo "Press Enter to continue after editing..."
read -r

echo -e "${GREEN}Step 11: Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/app.kprcli.com << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name app.kprcli.com;

    # Redirect to HTTPS
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

    # Proxy settings
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

    # Static file caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 60m;
        add_header Cache-Control "public, max-age=3600, immutable";
    }
}
EOF

echo -e "${GREEN}Step 12: Enabling Nginx site...${NC}"
ln -sf /etc/nginx/sites-available/app.kprcli.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo -e "${GREEN}Step 13: Starting applications with PM2...${NC}"
cd /var/www/kprcli
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo -e "${GREEN}Step 14: Setting up SSL with Let's Encrypt...${NC}"
echo "Please enter your email for SSL certificate:"
read -r EMAIL

if [ -z "$EMAIL" ]; then
    echo -e "${YELLOW}Skipping SSL setup. Run later with: certbot --nginx -d app.kprcli.com${NC}"
else
    certbot --nginx -d app.kprcli.com --non-interactive --agree-tos --email "$EMAIL"
    systemctl enable certbot.timer
fi

echo -e "${GREEN}Step 15: Setting up firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo -e "${GREEN}Step 16: Creating helpful aliases...${NC}"
cat >> ~/.bashrc << 'EOF'

# KprCli aliases
alias kprcli-logs='pm2 logs kprcli-app'
alias kprcli-bot-logs='pm2 logs kprcli-bot'
alias kprcli-restart='pm2 restart kprcli-app'
alias kprcli-status='pm2 status'
alias kprcli-monitor='pm2 monit'
EOF

echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "📝 Next Steps:"
echo "1. Update DNS: Point app.kprcli.com to $(curl -s ifconfig.me)"
echo "2. Edit environment variables: nano /var/www/kprcli/elite-starter/.env.local"
echo "3. Restart app: pm2 restart kprcli-app"
echo "4. View logs: pm2 logs kprcli-app"
echo "5. Monitor: pm2 monit"
echo ""
echo "🔧 Useful Commands:"
echo "  kprcli-logs      - View app logs"
echo "  kprcli-bot-logs  - View bot logs"
echo "  kprcli-restart   - Restart application"
echo "  kprcli-status    - Check status"
echo ""
echo "🌐 Your app will be available at: https://app.kprcli.com"
echo "   (after DNS propagation)"

# Create a status check script
cat > /usr/local/bin/kprcli-health << 'EOF'
#!/bin/bash
echo "🔍 KprCli Health Check"
echo "====================="
echo ""
echo "📊 PM2 Status:"
pm2 list
echo ""
echo "🌐 Nginx Status:"
systemctl status nginx --no-pager | head -5
echo ""
echo "🔴 Redis Status:"
redis-cli ping && echo "Redis: OK" || echo "Redis: FAILED"
echo ""
echo "💾 Disk Usage:"
df -h | grep -E '^/dev|Filesystem'
echo ""
echo "🧠 Memory Usage:"
free -h
echo ""
echo "🔗 Application URL: https://app.kprcli.com"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://app.kprcli.com/api/health || echo "API Health: Not accessible yet"
EOF

chmod +x /usr/local/bin/kprcli-health

echo ""
echo "Run 'kprcli-health' to check system status"