# 🚀 Quick Start Guide

## What's Already Done ✅

- ✅ Repository cloned (scanner branch)
- ✅ Node.js v24.11.0 installed via nvm
- ✅ npm dependencies installed
- ✅ `.env` file created

## What You Need To Do 📋

### Step 1: Install PostgreSQL

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Complete Setup

```bash
# Make sure nvm is loaded
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Navigate to project
cd /home/hendo420/soraScanner

# Run the automated setup script
./complete-setup.sh
```

### Step 3: Configure API Credentials

Edit `.env` and add your Sora API credentials:

```bash
nano .env
```

You need to add:
- `AUTH_BEARER_TOKEN=your_token_here`
- `COOKIE_SESSION=your_session_cookie`
- `CF_CLEARANCE=your_cloudflare_clearance`
- `CF_BM=your_cloudflare_bm`
- `OAI_SC=your_oai_sc`
- `OAI_DID=your_oai_did`
- `USER_AGENT=your_user_agent`
- `ACCEPT_LANGUAGE=en-US,en;q=0.9`
- Update `DB_PASSWORD` from `your_password_here` to actual password

**Note**: See the main README.md for instructions on how to obtain these credentials from your browser.

### Step 4: Start the Scanner

```bash
# Load nvm (if in a new terminal session)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Start the scanner
cd /home/hendo420/soraScanner
npm run scanner
```

## Alternative: Run All Steps at Once

If PostgreSQL is already installed:

```bash
cd /home/hendo420/soraScanner
./complete-setup.sh
```

## Using PM2 (Production Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start scanner with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs sora-feed-scanner

# Other PM2 commands
pm2 status              # Check status
pm2 restart sora-feed-scanner  # Restart
pm2 stop sora-feed-scanner     # Stop
pm2 delete sora-feed-scanner   # Remove from PM2
```

## File Locations

- **Project Directory**: `/home/hendo420/soraScanner`
- **Environment Config**: `/home/hendo420/soraScanner/.env`
- **Main Scanner**: `/home/hendo420/soraScanner/src/scanner.js`
- **Setup Script**: `/home/hendo420/soraScanner/src/setup.cjs`
- **Documentation**: `/home/hendo420/soraScanner/docs/`

## Need Help?

- Check `SETUP_STATUS.md` for detailed setup information
- Check `README.md` for full documentation
- Check logs in `logs/` directory if scanner is running with PM2

## Common Issues

**"nvm: command not found"**
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

**"PostgreSQL connection failed"**
```bash
sudo systemctl start postgresql
```

**"Authentication failed"**
- Check your `.env` file has valid `AUTH_BEARER_TOKEN`
- Tokens expire - you may need to get a new one
- Run `npm run refresh-cookies` to update cookies

---

**Ready to start?** → Install PostgreSQL, then run `./complete-setup.sh`

