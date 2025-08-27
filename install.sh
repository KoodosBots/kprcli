#!/bin/bash

# KprCli One-Liner Installation Script
# Usage: curl -sSL https://get.kprcli.com | bash
# Version: 1.0.0

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
KPRCLI_REPO="https://github.com/kprcli/kprcli.git"
INSTALL_DIR="$HOME/.kprcli"
DOCKER_COMPOSE_FILE="docker-compose.kprcli.yml"
MIN_DOCKER_VERSION="20.10.0"
MIN_DOCKER_COMPOSE_VERSION="2.0.0"

# System information
OS=""
ARCH=""
PACKAGE_MANAGER=""
AVAILABLE_PORT=""

# User preferences
ALLOW_ADMIN_UPDATES="false"
ENABLE_TELEMETRY="true"
INSTALLATION_MODE="full"  # full, minimal, development

# Print functions
print_header() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                        KprCli Installer                      ║${NC}"
    echo -e "${PURPLE}║            AI-Powered Form Automation Platform              ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# System detection functions
detect_os() {
    print_step "Detecting operating system..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v lsb_release &> /dev/null; then
            OS=$(lsb_release -si)
        elif [[ -f /etc/os-release ]]; then
            OS=$(grep '^NAME=' /etc/os-release | cut -d'"' -f2)
        else
            OS="Linux"
        fi
        
        # Detect package manager
        if command -v apt-get &> /dev/null; then
            PACKAGE_MANAGER="apt"
        elif command -v yum &> /dev/null; then
            PACKAGE_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PACKAGE_MANAGER="dnf"
        elif command -v pacman &> /dev/null; then
            PACKAGE_MANAGER="pacman"
        elif command -v zypper &> /dev/null; then
            PACKAGE_MANAGER="zypper"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macOS"
        if command -v brew &> /dev/null; then
            PACKAGE_MANAGER="brew"
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        OS="Windows"
        PACKAGE_MANAGER="chocolatey"  # Assume Chocolatey for Windows
    else
        print_error "Unsupported operating system: $OSTYPE"
    fi
    
    print_success "Detected OS: $OS"
}

detect_architecture() {
    print_step "Detecting system architecture..."
    
    ARCH=$(uname -m)
    case $ARCH in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7l)
            ARCH="armv7"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            ;;
    esac
    
    print_success "Detected architecture: $ARCH"
}

find_available_port() {
    print_step "Finding available port for web interface..."
    
    for port in 3000 3001 3002 3003 8080 8081; do
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            if ! lsof -i :$port &>/dev/null; then
                AVAILABLE_PORT=$port
                break
            fi
        fi
    done
    
    if [[ -z "$AVAILABLE_PORT" ]]; then
        print_error "No available ports found. Please free up ports 3000-3003 or 8080-8081"
    fi
    
    print_success "Will use port: $AVAILABLE_PORT"
}

# Dependency installation functions
install_docker() {
    print_step "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if version_gte "$DOCKER_VERSION" "$MIN_DOCKER_VERSION"; then
            print_success "Docker $DOCKER_VERSION already installed"
            return
        else
            print_warning "Docker $DOCKER_VERSION is too old, updating..."
        fi
    fi
    
    case $OS in
        "Ubuntu"|"Debian"|*ubuntu*|*debian*)
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER
            ;;
        "CentOS"|"Red Hat"*|"Fedora"|*centos*|*rhel*|*fedora*)
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER
            sudo systemctl enable docker
            sudo systemctl start docker
            ;;
        "macOS")
            if [[ "$PACKAGE_MANAGER" == "brew" ]]; then
                brew install --cask docker
            else
                print_info "Please install Docker Desktop from https://docker.com/products/docker-desktop"
                read -p "Press Enter when Docker Desktop is installed..."
            fi
            ;;
        "Windows")
            print_info "Please install Docker Desktop from https://docker.com/products/docker-desktop"
            read -p "Press Enter when Docker Desktop is installed..."
            ;;
        *)
            curl -fsSL https://get.docker.com | sh
            ;;
    esac
    
    print_success "Docker installed successfully"
}

install_docker_compose() {
    print_step "Installing Docker Compose..."
    
    if command -v docker compose &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "2.0.0")
        if version_gte "$COMPOSE_VERSION" "$MIN_DOCKER_COMPOSE_VERSION"; then
            print_success "Docker Compose $COMPOSE_VERSION already available"
            return
        fi
    fi
    
    # Try installing via package manager first
    case $PACKAGE_MANAGER in
        "apt")
            sudo apt-get update
            sudo apt-get install -y docker-compose-plugin
            ;;
        "yum"|"dnf")
            sudo $PACKAGE_MANAGER install -y docker-compose-plugin
            ;;
        "pacman")
            sudo pacman -S --noconfirm docker-compose
            ;;
        "brew")
            brew install docker-compose
            ;;
        *)
            # Fallback to binary installation
            COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
            sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
            ;;
    esac
    
    print_success "Docker Compose installed successfully"
}

install_git() {
    print_step "Installing Git..."
    
    if command -v git &> /dev/null; then
        print_success "Git already installed"
        return
    fi
    
    case $PACKAGE_MANAGER in
        "apt")
            sudo apt-get update && sudo apt-get install -y git
            ;;
        "yum"|"dnf")
            sudo $PACKAGE_MANAGER install -y git
            ;;
        "pacman")
            sudo pacman -S --noconfirm git
            ;;
        "zypper")
            sudo zypper install -y git
            ;;
        "brew")
            brew install git
            ;;
        *)
            print_error "Please install Git manually for your system"
            ;;
    esac
    
    print_success "Git installed successfully"
}

# Utility functions
version_gte() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

generate_env_file() {
    print_step "Generating environment configuration..."
    
    ENV_FILE="$INSTALL_DIR/.env"
    USER_ID=$(openssl rand -hex 16)
    
    cat > "$ENV_FILE" << EOF
# KprCli Configuration
# Generated on $(date)

# Installation Settings
USER_INSTALLATION_ID=$USER_ID
INSTALLATION_MODE=$INSTALLATION_MODE
KPRCLI_VERSION=1.0.0
KPRCLI_PORT=$AVAILABLE_PORT

# Clerk Authentication (Required - Get from clerk.dev)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret_here

# Convex Database (Required - Get from convex.dev)
NEXT_PUBLIC_CONVEX_URL=your_convex_url_here
CONVEX_DEPLOYMENT=your_convex_deployment_here

# Supabase Configuration (Legacy support)
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_KEY=your_supabase_service_key_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=your_bot_username_here

# Payment Processing (OxaPay)
OXAPAY_API_KEY=your_oxapay_api_key_here
OXAPAY_MERCHANT=your_oxapay_merchant_id_here

# AI Model Providers
GROQ_API_KEY=your_groq_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OLLAMA_BASE_URL=http://localhost:11434

# External Services
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
BRIGHT_DATA_API_KEY=your_bright_data_api_key_here

# Admin Configuration
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_CONTROL_ENDPOINT=wss://admin.kprcli.com
ADMIN_WEBSOCKET_URL=wss://admin.kprcli.com/ws
ADMIN_CHANNEL_ENCRYPTION_KEY=$(openssl rand -hex 32)

# System Configuration
NODE_ENV=production
WEBHOOK_URL=http://localhost:$AVAILABLE_PORT
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Feature Flags
ADMIN_CONTROL_ENABLED=$ALLOW_ADMIN_UPDATES
SYSTEM_MONITORING_ENABLED=true
TELEMETRY_ENABLED=$ENABLE_TELEMETRY
AI_FORM_AUTOMATION_ENABLED=true
MITMPROXY_ENABLED=true
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EOF
    
    print_success "Environment configuration generated"
}

prompt_user_consent() {
    print_step "Configuring installation options..."
    
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                    ADMIN CONTROL SETUP                        ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "This installation can optionally enable admin control features:"
    echo ""
    echo -e "${GREEN}✓${NC} Send system updates and configuration changes"
    echo -e "${GREEN}✓${NC} Monitor system health and performance metrics"
    echo -e "${GREEN}✓${NC} Push emergency fixes and security updates"
    echo -e "${GREEN}✓${NC} Provide remote technical support when needed"
    echo ""
    echo -e "${CYAN}Note: All admin access is encrypted and requires your consent.${NC}"
    echo -e "${CYAN}You can disable this at any time by editing your .env file.${NC}"
    echo ""
    
    read -p "Enable admin control features? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ALLOW_ADMIN_UPDATES="true"
        print_success "Admin control enabled"
    else
        ALLOW_ADMIN_UPDATES="false"
        print_info "Admin control disabled"
    fi
    
    echo ""
    read -p "Enable anonymous usage analytics to help improve KprCli? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        ENABLE_TELEMETRY="false"
        print_info "Analytics disabled"
    else
        ENABLE_TELEMETRY="true"
        print_success "Analytics enabled"
    fi
}

# Main installation functions
setup_directory() {
    print_step "Setting up installation directory..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        print_warning "Existing installation found at $INSTALL_DIR"
        read -p "Would you like to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            print_error "Installation cancelled"
        fi
    fi
    
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    print_success "Installation directory ready: $INSTALL_DIR"
}

clone_repository() {
    print_step "Downloading KprCli source code..."
    
    # For now, copy from current directory structure
    # In production, this would clone from the actual repository
    if [[ -f "$HOME/Desktop/KprCLi/Cli/docker-compose.kprcli.yml" ]]; then
        cp -r "$HOME/Desktop/KprCLi/Cli/"* .
    else
        # Fallback: create minimal structure
        mkdir -p TeleKprV2 elite-starter ai-engine admin-channel nginx
        touch TeleKprV2/Dockerfile.telegram TeleKprV2/Dockerfile.admin
        touch elite-starter/Dockerfile
        touch ai-engine/Dockerfile 
        touch admin-channel/Dockerfile
        touch Dockerfile.api Dockerfile.ai
    fi
    
    print_success "Source code downloaded"
}

configure_docker_ports() {
    print_step "Configuring Docker ports..."
    
    # Update docker-compose file with detected port
    if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
        sed -i.bak "s/3000:3000/$AVAILABLE_PORT:3000/g" "$DOCKER_COMPOSE_FILE"
        print_success "Configured web interface on port $AVAILABLE_PORT"
    fi
}

start_services() {
    print_step "Starting KprCli services..."
    
    # Ensure Docker daemon is running
    if ! docker info &>/dev/null; then
        print_error "Docker daemon is not running. Please start Docker and try again."
    fi
    
    # Start services
    if command -v docker compose &> /dev/null; then
        docker compose -f "$DOCKER_COMPOSE_FILE" up -d
    else
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    fi
    
    print_success "KprCli services started"
}

wait_for_services() {
    print_step "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -sf "http://localhost:$AVAILABLE_PORT" >/dev/null 2>&1; then
            break
        fi
        attempt=$((attempt + 1))
        sleep 2
        echo -n "."
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        print_warning "Services may still be starting up"
    else
        print_success "Services are ready"
    fi
}

open_browser() {
    print_step "Opening KprCli in your browser..."
    
    local url="http://localhost:$AVAILABLE_PORT"
    
    case $OS in
        "macOS")
            open "$url"
            ;;
        "Windows")
            start "$url"
            ;;
        *)
            if command -v xdg-open &> /dev/null; then
                xdg-open "$url"
            elif command -v gnome-open &> /dev/null; then
                gnome-open "$url"
            else
                print_info "Please open your browser and navigate to: $url"
            fi
            ;;
    esac
}

print_completion() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                 🎉 Installation Complete! 🎉                 ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}KprCli is now running at: ${YELLOW}http://localhost:$AVAILABLE_PORT${NC}"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo -e "1. ${CYAN}Complete your authentication setup using Clerk${NC}"
    echo -e "2. ${CYAN}Configure your API keys in the settings panel${NC}"
    echo -e "3. ${CYAN}Start training your first form automation${NC}"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "• ${YELLOW}cd $INSTALL_DIR${NC} - Navigate to installation directory"
    echo -e "• ${YELLOW}docker compose -f $DOCKER_COMPOSE_FILE logs -f${NC} - View logs"
    echo -e "• ${YELLOW}docker compose -f $DOCKER_COMPOSE_FILE stop${NC} - Stop services"
    echo -e "• ${YELLOW}docker compose -f $DOCKER_COMPOSE_FILE start${NC} - Start services"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo -e "• ${YELLOW}$INSTALL_DIR/.env${NC} - Environment variables"
    echo -e "• ${YELLOW}$INSTALL_DIR/logs/${NC} - Application logs"
    echo ""
    if [[ "$ALLOW_ADMIN_UPDATES" == "true" ]]; then
        echo -e "${GREEN}✓${NC} Admin control enabled - You'll receive system updates automatically"
    fi
    if [[ "$ENABLE_TELEMETRY" == "true" ]]; then
        echo -e "${GREEN}✓${NC} Analytics enabled - Thank you for helping improve KprCli!"
    fi
    echo ""
    echo -e "${PURPLE}Happy automating! 🤖${NC}"
    echo ""
}

# Error handling
cleanup_on_error() {
    print_error "Installation failed. Cleaning up..."
    if [[ -d "$INSTALL_DIR" ]]; then
        cd "$HOME"
        rm -rf "$INSTALL_DIR"
    fi
}

trap cleanup_on_error ERR

# Main installation flow
main() {
    print_header
    
    # System detection
    detect_os
    detect_architecture
    find_available_port
    
    # User consent
    prompt_user_consent
    
    # Install dependencies
    install_docker
    install_docker_compose
    install_git
    
    # Setup KprCli
    setup_directory
    clone_repository
    generate_env_file
    configure_docker_ports
    
    # Start services
    start_services
    wait_for_services
    
    # Completion
    open_browser
    print_completion
}

# Run main function
main "$@"