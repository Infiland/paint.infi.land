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
chown paintapp:paintapp $APP_DIR

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
pnpm install --production

# Switch to paintapp user for PM2 operations
echo "🔄 Switching to paintapp user for PM2 operations..."
su - paintapp -c "
    cd $APP_DIR
    
    # Stop existing PM2 process if running
    pm2 delete $APP_NAME 2>/dev/null || true
    
    # Start application with PM2
    pm2 start server.js --name $APP_NAME --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup
"

# Copy nginx configuration
echo "🌐 Setting up nginx configuration..."
cp nginx.conf /etc/nginx/sites-available/$DOMAIN

# Enable nginx site if not already enabled
if [ ! -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
nginx -t

# Reload nginx
echo "🔄 Reloading nginx..."
systemctl reload nginx

# Check PM2 status
echo "📊 Checking PM2 status..."
su - paintapp -c "pm2 status"

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be available at: http://$DOMAIN"
echo "📊 Monitor with: su - paintapp -c 'pm2 monit'"
echo "📋 View logs with: su - paintapp -c 'pm2 logs $APP_NAME'"