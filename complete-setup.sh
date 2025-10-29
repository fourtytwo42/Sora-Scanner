#!/bin/bash

# Sora Feed Scanner - Complete Setup Script
# This script helps you complete the remaining setup steps

echo "🎬 Sora Feed Scanner - Setup Completion"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if PostgreSQL is installed
echo -e "${YELLOW}Checking PostgreSQL installation...${NC}"
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✅ PostgreSQL is installed${NC}"
    psql --version
else
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    echo ""
    echo "Please install PostgreSQL first:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y postgresql postgresql-contrib"
    echo "  sudo systemctl start postgresql"
    echo "  sudo systemctl enable postgresql"
    echo ""
    exit 1
fi

# Check PostgreSQL service status
echo ""
echo -e "${YELLOW}Checking PostgreSQL service...${NC}"
if sudo systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}✅ PostgreSQL service is running${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL service is not running. Starting it...${NC}"
    sudo systemctl start postgresql
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PostgreSQL service started${NC}"
    else
        echo -e "${RED}❌ Failed to start PostgreSQL service${NC}"
        exit 1
    fi
fi

# Check if .env file exists and has required variables
echo ""
echo -e "${YELLOW}Checking .env configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Check for AUTH_BEARER_TOKEN
if grep -q "AUTH_BEARER_TOKEN=.*[a-zA-Z0-9]" .env; then
    echo -e "${GREEN}✅ AUTH_BEARER_TOKEN is configured${NC}"
else
    echo -e "${YELLOW}⚠️  AUTH_BEARER_TOKEN is not configured${NC}"
    echo "   Please add your Sora API credentials to .env"
fi

# Run the setup script
echo ""
echo -e "${YELLOW}Running database setup...${NC}"
npm run setup

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Setup completed successfully!${NC}"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Make sure your .env file has all required API credentials"
    echo "   2. Start the scanner: npm run scanner"
    echo "   3. Or use PM2: pm2 start ecosystem.config.js"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Setup failed. Please check the error messages above.${NC}"
    exit 1
fi

