#!/bin/bash

set -e

APP_NAME="paint-app"
APP_DIR="/var/www/paint.infi.land"
DOMAIN="paint.infi.land"
PORT=3001

echo "🚀 Starting deployment for $DOMAIN..."

# Check if running as paintapp user or root
if [[ $EUID -eq 0 ]]; then
    echo "❌ Don't run this script as root. Run as paintapp user or create the user first."
    exit 1
fi

# Install pm2 globally for process management
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
else
    echo "✅ PM2 already installed: $(pm2 --version)"
fi

# Create application directory
echo "📁 Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown paintapp:paintapp $APP_DIR

# Navigate to app directory
cd $APP_DIR

# Pull latest changes if git repo exists, otherwise clone
if [ -d ".git" ]; then
    echo "🔄 Pulling latest changes..."
    git pull origin main
else
    echo "📋 Cloning repository..."
    git clone https://github.com/yourusername/paint.infi.land.git .
fi

# Create .env file with correct port
echo "⚙️ Setting up environment..."
echo "PORT=$PORT" > .env
echo "NODE_ENV=production" >> .env

# Install dependencies
echo "📦 Installing application dependencies..."
npm install --production

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 process..."
pm2 delete $APP_NAME 2>/dev/null || true

# Start application with PM2
echo "🚀 Starting application with PM2..."
pm2 start server.js --name $APP_NAME --env production

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script if not already done
echo "🔧 Setting up PM2 startup..."
pm2 startup || true

# Copy nginx configuration
echo "🌐 Setting up nginx configuration..."
sudo cp nginx.conf /etc/nginx/sites-available/$DOMAIN

# Enable nginx site if not already enabled
if [ ! -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

# Check PM2 status
echo "📊 Checking PM2 status..."
pm2 status

# Show application logs
echo "📋 Recent application logs:"
pm2 logs $APP_NAME --lines 20

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be available at: http://$DOMAIN"
echo "📊 Monitor with: pm2 monit"
echo "📋 View logs with: pm2 logs $APP_NAME"