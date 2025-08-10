#!/bin/bash

# Deploy script for paint.infi.land on Ubuntu VPS
# Run this script on your Ubuntu VPS to set up and deploy the application

set -e  # Exit on any error

APP_NAME="paint-infi-land"
APP_DIR="/opt/$APP_NAME"
SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
DOMAIN="paint.infi.land"
PORT=3000

echo "🚀 Starting deployment for $DOMAIN..."

# Install pm2 globally for process management
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 already installed: $(pm2 --version)"
fi

# Create application directory
echo "📁 Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Clone/copy application files (assumes you're running this from the project directory)
echo "📋 Copying application files..."
cp -r . $APP_DIR/
cd $APP_DIR

# Install dependencies
echo "📦 Installing application dependencies..."
pnpm install --production

# Create systemd service file
echo "⚙️ Creating systemd service..."
sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=Paint.infi.land Real-time Drawing App
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$PORT
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=$APP_NAME

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
echo "🔄 Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable $APP_NAME
sudo systemctl start $APP_NAME

# Check service status
echo "📊 Checking service status..."
sudo systemctl status $APP_NAME --no-pager

echo "✅ Deployment completed successfully!"