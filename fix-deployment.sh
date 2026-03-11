#!/bin/bash

set -euo pipefail

APP_NAME="paint-app"
BUILD_TIME=$(date -Iseconds)

echo "🔧 Fixing deployment issues..."

# Kill ALL PM2 processes and clear everything
echo "🛑 Stopping all PM2 processes..."
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Clear any lingering processes on ports 3000/3001
echo "🧹 Cleaning up any processes on ports 3000-3001..."
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
lsof -ti :3001 | xargs kill -9 2>/dev/null || true

# Update .env with current build time
echo "📝 Updating .env file..."
cat > .env << EOF
PORT=3001
NODE_ENV=production
BUILD_TIME=$BUILD_TIME
EOF

# Build server and browser assets
echo "🏗️ Building TypeScript application..."
pnpm build

# Clear PM2 logs
echo "🧹 Clearing PM2 logs..."
pm2 flush

# Start fresh
echo "🚀 Starting application..."
pm2 start dist/server.js --name "$APP_NAME" --cwd "$(pwd)" --update-env

# Save PM2 configuration
pm2 save

echo "✅ Deployment fixed!"
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "🌐 App should be running at: https://paint.infi.land"
echo "📋 Check logs: pm2 logs $APP_NAME"
