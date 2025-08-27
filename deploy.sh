#!/bin/bash

# KprCli Client Deployment Script
# Easy one-command deployment for clients

set -e

echo "🚀 KprCli Deployment Script"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
check_docker() {
    echo -e "${BLUE}📋 Checking Docker installation...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
        echo -e "${YELLOW}💡 Visit: https://docs.docker.com/get-docker/${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Docker is ready${NC}"
}

# Check environment file
check_environment() {
    echo -e "${BLUE}📋 Checking environment configuration...${NC}"
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.template" ]; then
            echo -e "${YELLOW}⚠️  No .env file found. Copying from template...${NC}"
            cp .env.template .env
            echo -e "${RED}🔧 Please edit .env file with your actual configuration values and run this script again.${NC}"
            echo -e "${YELLOW}📝 Required: CLERK keys, SUPABASE keys, JWT_SECRET, TELEGRAM_BOT_TOKEN${NC}"
            exit 1
        else
            echo -e "${RED}❌ No .env file found and no template available.${NC}"
            exit 1
        fi
    fi
    
    # Check required environment variables
    source .env
    
    missing_vars=()
    
    [ -z "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" ] && missing_vars+=("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
    [ -z "$CLERK_SECRET_KEY" ] && missing_vars+=("CLERK_SECRET_KEY")
    [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && missing_vars+=("NEXT_PUBLIC_SUPABASE_URL")
    [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && missing_vars+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    [ -z "$SUPABASE_SERVICE_KEY" ] && missing_vars+=("SUPABASE_SERVICE_KEY")
    [ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo -e "${RED}❌ Missing required environment variables:${NC}"
        for var in "${missing_vars[@]}"; do
            echo -e "${RED}   - $var${NC}"
        done
        echo -e "${YELLOW}📝 Please update your .env file and run this script again.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Environment configuration is ready${NC}"
}

# Pull latest images
pull_images() {
    echo -e "${BLUE}📥 Pulling required Docker images...${NC}"
    docker-compose -f docker-compose.simple.yml pull redis nginx
    echo -e "${GREEN}✅ Images pulled successfully${NC}"
}

# Build services
build_services() {
    echo -e "${BLUE}🔨 Building KprCli services...${NC}"
    
    # Stop any existing containers
    docker-compose -f docker-compose.simple.yml down --remove-orphans
    
    # Build the web service
    echo -e "${YELLOW}🏗️  Building kprcli-web...${NC}"
    docker-compose -f docker-compose.simple.yml build kprcli-web
    
    echo -e "${GREEN}✅ Services built successfully${NC}"
}

# Start essential services
start_services() {
    echo -e "${BLUE}🚀 Starting KprCli services...${NC}"
    
    # Start Redis first
    echo -e "${YELLOW}📀 Starting Redis...${NC}"
    docker-compose -f docker-compose.simple.yml up -d redis
    
    # Wait for Redis to be ready
    echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
    sleep 5
    
    # Start the web service and nginx
    echo -e "${YELLOW}🌐 Starting Web Interface and Nginx...${NC}"
    docker-compose -f docker-compose.simple.yml up -d kprcli-web nginx
    
    # Optional: Start Telegram service if configured
    if [ ! -z "$TELEGRAM_BOT_TOKEN" ] && [ "$TELEGRAM_BOT_TOKEN" != "your_telegram_bot_token_here" ]; then
        echo -e "${YELLOW}🤖 Starting Telegram Bot...${NC}"
        docker-compose -f docker-compose.simple.yml up -d kprcli-telegram
    fi
    
    echo -e "${GREEN}✅ Services started successfully${NC}"
}

# Wait for services to be ready
wait_for_services() {
    echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
    
    # Wait for web service
    echo -e "${YELLOW}🌐 Checking web service...${NC}"
    for i in {1..30}; do
        if curl -f http://localhost/nginx-health &> /dev/null; then
            echo -e "${GREEN}✅ Web service is ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Web service failed to start${NC}"
            docker-compose -f docker-compose.simple.yml logs kprcli-web
            exit 1
        fi
        sleep 2
    done
}

# Show deployment status
show_status() {
    echo -e "${GREEN}🎉 KprCli Deployment Complete!${NC}"
    echo "================================="
    echo ""
    echo -e "${BLUE}📊 Service Status:${NC}"
    docker-compose -f docker-compose.simple.yml ps
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo -e "${GREEN}• Web Interface: http://localhost${NC}"
    echo -e "${GREEN}• API Health: http://localhost/api/health${NC}"
    echo -e "${GREEN}• Nginx Health: http://localhost/nginx-health${NC}"
    echo -e "${GREEN}• Session Analytics: http://localhost/api/session/current${NC}"
    
    if [ -f "nginx/nginx.conf" ]; then
        echo -e "${GREEN}• Load Balancer: http://localhost${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}📋 Next Steps:${NC}"
    echo -e "${YELLOW}1. Open http://localhost in your browser${NC}"
    echo -e "${YELLOW}2. Sign up for a new account${NC}"
    echo -e "${YELLOW}3. Test device authorization at http://localhost/device${NC}"
    echo -e "${YELLOW}4. Configure Telegram bot (optional)${NC}"
    echo ""
    echo -e "${BLUE}🔧 Management Commands:${NC}"
    echo -e "${YELLOW}• View logs: docker-compose -f docker-compose.kprcli.yml logs -f${NC}"
    echo -e "${YELLOW}• Stop services: docker-compose -f docker-compose.kprcli.yml down${NC}"
    echo -e "${YELLOW}• Restart: docker-compose -f docker-compose.kprcli.yml restart${NC}"
}

# Main deployment function
main() {
    echo -e "${BLUE}Starting KprCli deployment...${NC}"
    
    check_docker
    check_environment
    pull_images
    build_services
    start_services
    wait_for_services
    show_status
    
    echo -e "${GREEN}🚀 Deployment successful! KprCli is now running.${NC}"
}

# Handle script arguments
case "${1:-}" in
    "stop")
        echo -e "${YELLOW}🛑 Stopping KprCli services...${NC}"
        docker-compose -f docker-compose.simple.yml down
        echo -e "${GREEN}✅ Services stopped${NC}"
        ;;
    "restart")
        echo -e "${YELLOW}🔄 Restarting KprCli services...${NC}"
        docker-compose -f docker-compose.simple.yml restart
        echo -e "${GREEN}✅ Services restarted${NC}"
        ;;
    "logs")
        docker-compose -f docker-compose.simple.yml logs -f
        ;;
    "status")
        docker-compose -f docker-compose.simple.yml ps
        ;;
    "update")
        echo -e "${BLUE}🔄 Updating KprCli...${NC}"
        docker-compose -f docker-compose.simple.yml down
        git pull origin main
        main
        ;;
    *)
        main
        ;;
esac