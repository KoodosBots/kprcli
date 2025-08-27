#!/bin/bash

# KprCli CLI Connection Test Script
# This script demonstrates the complete CLI connection flow

echo "🧪 KprCli CLI Connection Test"
echo "=============================="
echo

# Check if Docker is running
echo "1. Checking Docker deployment status..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep kprcli
echo

# Test API endpoints
echo "2. Testing API health..."
curl -s http://localhost/api/health | jq -r '.status' 2>/dev/null || echo "API health check failed"
echo

# Test device authorization endpoint
echo "3. Testing device authorization endpoint..."
DEVICE_AUTH=$(curl -s -X POST http://localhost/api/device/authorize \
  -H "Content-Type: application/json" \
  -d '{"client_id": "test-cli", "scope": "read write"}')

if echo "$DEVICE_AUTH" | jq -e '.device_code' >/dev/null 2>&1; then
  echo "✅ Device authorization endpoint working"
  USER_CODE=$(echo "$DEVICE_AUTH" | jq -r '.user_code')
  VERIFICATION_URI=$(echo "$DEVICE_AUTH" | jq -r '.verification_uri')
  echo "   Generated user code: $USER_CODE"
  echo "   Verification URI: $VERIFICATION_URI"
else
  echo "❌ Device authorization endpoint failed"
fi
echo

# Test CLI build
echo "4. Testing CLI application..."
cd kprcli-cli
if [ -f "dist/index.js" ]; then
  echo "✅ CLI build exists"
  
  # Test CLI commands
  echo "   Testing CLI help:"
  node dist/index.js --help | head -5
  echo
  
  echo "   Testing CLI status:"
  node dist/index.js status | head -10
  
else
  echo "❌ CLI build not found. Run 'npm run build' in kprcli-cli directory"
fi

echo
echo "🎉 CLI Connection Test Summary:"
echo "- Docker deployment: $(docker ps | grep kprcli-web >/dev/null && echo "✅ Running" || echo "❌ Not running")"
echo "- API endpoints: $(curl -s http://localhost/api/health >/dev/null && echo "✅ Accessible" || echo "❌ Not accessible")" 
echo "- Device authorization: $(curl -s -X POST http://localhost/api/device/authorize -H "Content-Type: application/json" -d '{"client_id": "test"}' | grep -q user_code && echo "✅ Working" || echo "❌ Failed")"
echo "- CLI application: $([ -f "kprcli-cli/dist/index.js" ] && echo "✅ Built" || echo "❌ Not built")"
echo
echo "📖 Next steps:"
echo "1. Run: cd kprcli-cli && node dist/index.js auth login"
echo "2. Complete web authorization at: http://localhost/device"
echo "3. Use CLI commands with: node dist/index.js [command]"
echo
echo "📚 Documentation: CLI-CONNECTION-GUIDE.md"