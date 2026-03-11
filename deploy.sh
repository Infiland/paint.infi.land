#!/bin/bash

set -euo pipefail

APP_NAME="paint-app"
APP_DIR="/var/www/paint.infi.land"
DOMAIN="paint.infi.land"
PORT=3001
BUILD_TIME=$(date -Iseconds)

echo "🚀 Starting deployment for $DOMAIN..."
echo "📅 Build time: $BUILD_TIME"

# Install pnpm if not available
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
else
    echo "✅ pnpm already installed: $(pnpm --version)"
fi

# Install pm2 globally for process management
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    pnpm add -g pm2
else
    echo "✅ PM2 already installed: $(pm2 --version)"
fi

# Create application directory
echo "📁 Setting up application directory..."
mkdir -p $APP_DIR

# Navigate to app directory
cd $APP_DIR

# Stop existing PM2 process early to prevent conflicts
echo "🛑 Stopping existing PM2 process..."
pm2 delete $APP_NAME 2>/dev/null || true

# Handle git operations more robustly
if [ -d .git ]; then
    echo "🔄 Updating code from git..."
    git fetch --all
    git reset --hard origin/$(git rev-parse --abbrev-ref HEAD) 2>/dev/null || git reset --hard HEAD
    git clean -fd
else
    echo "⚠️ No git repository found in $APP_DIR"
    echo "💡 Make sure to initialize git and pull your code first!"
fi

# Remove node_modules for clean install
echo "🧹 Cleaning dependencies..."
rm -rf node_modules

# Install dependencies with pnpm
echo "📦 Installing application dependencies with pnpm..."
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  echo "⚠️ pnpm-lock.yaml not found; installing without frozen lockfile"
  pnpm install --no-frozen-lockfile
fi

# Create/update .env file with proper environment variables
echo "🔧 Setting up environment variables..."
cat > .env << EOF
PORT=$PORT
NODE_ENV=production
BUILD_TIME=$BUILD_TIME
EOF

# Build server and browser assets
echo "🏗️ Building TypeScript application..."
pnpm build

# Start application with PM2
echo "🚀 Starting application with PM2..."
pm2 start dist/server.js --name "$APP_NAME" --cwd "$APP_DIR" --update-env

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script (only if not already configured)
echo "🔧 Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
systemctl reload nginx

# Check PM2 status
echo "📊 Checking PM2 status..."
pm2 status

# Wait a moment and check if app is running
sleep 3
if pm2 describe $APP_NAME > /dev/null 2>&1; then
    echo "✅ Application is running successfully!"
    echo "📅 Build time: $BUILD_TIME"
else
    echo "❌ Application failed to start. Check logs with: pm2 logs $APP_NAME"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be available at: https://$DOMAIN"
echo "📊 Monitor with: pm2 monit"
echo "📋 View logs with: pm2 logs $APP_NAME"
