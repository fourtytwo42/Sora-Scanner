#!/bin/bash
# Set system timezone to America/Chicago (Central Time)

echo "Setting system timezone to America/Chicago (Central Time)..."
sudo timedatectl set-timezone America/Chicago

echo ""
echo "Current timezone:"
timedatectl status | grep "Time zone"

echo ""
echo "✅ System timezone set to Central Time"
echo ""
echo "Setting PostgreSQL timezone..."
sudo -u postgres psql -d sora_feed -c "ALTER DATABASE sora_feed SET timezone = 'America/Chicago';"

echo ""
echo "PostgreSQL timezone:"
sudo -u postgres psql -d sora_feed -c "SHOW timezone;"

echo ""
echo "✅ PostgreSQL timezone configured"
echo ""
echo "Please restart PM2 to apply timezone changes:"
echo "  pm2 restart sora-scanner"

