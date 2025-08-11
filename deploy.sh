#!/bin/bash

set -euo pipefail

APP_NAME="paint-app"
APP_DIR="/var/www/paint.infi.land"
DOMAIN="paint.infi.land"
PORT=3001

echo "🚀 Starting deployment for $DOMAIN..."

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

if [ -d .git ]; then
    echo "🔄 Updating code from git..."
    git fetch --all
    git reset --hard
    git clean -fd
else
    echo "⚠️ No git repository found in $APP_DIR. Skipping git fetch/pull."
fi

# Remove node_modules and clean install
echo "🧹 Cleaning node_modules..."
rm -rf node_modules

# Install dependencies with pnpm
echo "📦 Installing application dependencies with pnpm..."
pnpm install --frozen-lockfile --prod

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 process..."
pm2 delete $APP_NAME 2>/dev/null || true

# Start application with PM2
echo "🚀 Starting application with PM2..."
PORT="$PORT" NODE_ENV=production pm2 start server.js --name "$APP_NAME" --cwd "$APP_DIR"

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
sleep 2
if pm2 describe $APP_NAME > /dev/null 2>&1; then
    echo "✅ Application is running successfully!"
else
    echo "❌ Application failed to start. Check logs with: pm2 logs $APP_NAME"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be available at: http://$DOMAIN"
echo "📊 Monitor with: pm2 monit"
echo "📋 View logs with: pm2 logs $APP_NAME"