@echo off
REM KprCli Client Deployment Script for Windows
REM Easy one-command deployment for Windows clients

setlocal EnableDelayedExpansion

echo.
echo 🚀 KprCli Deployment Script for Windows
echo ==========================================
echo.

REM Check if Docker is running
echo 📋 Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    echo 💡 Visit: https://docs.docker.com/desktop/install/windows-install/
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose is not available. Please install Docker Desktop.
    pause
    exit /b 1
)

echo ✅ Docker is ready
echo.

REM Check environment file
echo 📋 Checking environment configuration...
if not exist ".env" (
    if exist ".env.template" (
        echo ⚠️  No .env file found. Copying from template...
        copy .env.template .env >nul
        echo.
        echo 🔧 Please edit .env file with your actual configuration values and run this script again.
        echo 📝 Required: CLERK keys, SUPABASE keys, JWT_SECRET, TELEGRAM_BOT_TOKEN
        echo.
        echo Opening .env file for editing...
        start notepad .env
        pause
        exit /b 1
    ) else (
        echo ❌ No .env file found and no template available.
        pause
        exit /b 1
    )
)

echo ✅ Environment configuration found
echo.

REM Stop any existing containers
echo 🛑 Stopping any existing containers...
docker-compose -f docker-compose.simple.yml down --remove-orphans >nul 2>&1
echo ✅ Stopped existing containers
echo.

REM Pull required images
echo 📥 Pulling required Docker images...
docker-compose -f docker-compose.simple.yml pull redis nginx
if errorlevel 1 (
    echo ❌ Failed to pull images
    pause
    exit /b 1
)
echo ✅ Images pulled successfully
echo.

REM Build services
echo 🔨 Building KprCli web service...
docker-compose -f docker-compose.simple.yml build kprcli-web
if errorlevel 1 (
    echo ❌ Failed to build web service
    docker-compose -f docker-compose.simple.yml logs kprcli-web
    pause
    exit /b 1
)
echo ✅ Web service built successfully
echo.

REM Start Redis
echo 📀 Starting Redis...
docker-compose -f docker-compose.simple.yml up -d redis
if errorlevel 1 (
    echo ❌ Failed to start Redis
    docker-compose -f docker-compose.simple.yml logs redis
    pause
    exit /b 1
)

REM Wait for Redis
echo ⏳ Waiting for Redis to be ready...
timeout /t 5 /nobreak >nul

REM Start web service and nginx
echo 🌐 Starting Web Interface and Nginx...
docker-compose -f docker-compose.simple.yml up -d kprcli-web nginx
if errorlevel 1 (
    echo ❌ Failed to start services
    docker-compose -f docker-compose.simple.yml logs kprcli-web nginx
    pause
    exit /b 1
)

REM Wait for services to be ready
echo ⏳ Waiting for services to be ready...
set /a count=0
:wait_loop
set /a count+=1
curl -f http://localhost/nginx-health >nul 2>&1
if errorlevel 1 (
    if !count! LSS 30 (
        timeout /t 2 /nobreak >nul
        goto wait_loop
    ) else (
        echo ❌ Web service failed to start after 60 seconds
        docker-compose -f docker-compose.simple.yml logs kprcli-web
        pause
        exit /b 1
    )
)

echo ✅ Web service is ready
echo.

REM Show deployment status
echo 🎉 KprCli Deployment Complete!
echo =================================
echo.
echo 📊 Service Status:
docker-compose -f docker-compose.simple.yml ps
echo.
echo 🌐 Access Points:
echo • Web Interface: http://localhost
echo • API Health: http://localhost/api/health
echo • Nginx Health: http://localhost/nginx-health
echo • Session Analytics: http://localhost/api/session/current
echo.
echo 📋 Next Steps:
echo 1. Open http://localhost in your browser
echo 2. Sign up for a new account
echo 3. Test device authorization at http://localhost/device
echo 4. Configure Telegram bot (optional)
echo.
echo 🔧 Management Commands:
echo • View logs: docker-compose -f docker-compose.simple.yml logs -f
echo • Stop services: docker-compose -f docker-compose.simple.yml down
echo • Restart: docker-compose -f docker-compose.simple.yml restart
echo.

if "%1"=="auto" goto end

echo 🚀 Deployment successful! KprCli is now running.
echo.
echo Press any key to open the web interface...
pause >nul
start http://localhost

:end
echo KprCli deployment completed successfully!