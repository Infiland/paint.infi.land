#!/bin/bash

set -e

APP_NAME="paint-app"
APP_DIR="/var/www/paint.infi.land"
DOMAIN="paint.infi.land"
PORT=3001

echo "🚀 Starting deployment for $DOMAIN..."

# Install pm2 globally for process management
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    pnpm install -g pm2
else
    echo "✅ PM2 already installed: $(pm2 --version)"
fi

# Create application directory
echo "📁 Setting up application directory..."
mkdir -p $APP_DIR

# Navigate to app directory
cd $APP_DIR


# Install dependencies
echo "📦 Installing application dependencies..."
pnpm install --prod

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 process..."
pm2 delete $APP_NAME 2>/dev/null || true

# Start application with PM2
echo "🚀 Starting application with PM2..."
pm2 start server.js --name $APP_NAME

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script
echo "🔧 Setting up PM2 startup..."
pm2 startup

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
systemctl reload nginx

# Check PM2 status
echo "📊 Checking PM2 status..."
pm2 status

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be available at: http://$DOMAIN"
echo "📊 Monitor with: pm2 monit"
echo "📋 View logs with: pm2 logs $APP_NAME"