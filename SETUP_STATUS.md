# 🎬 Sora Feed Scanner - Setup Status

## ✅ Completed Steps

1. **Repository Cloned** ✅
   - Cloned from: https://github.com/fourtytwo42/soraFeed
   - Branch: `scanner`
   - Location: `/home/hendo420/soraScanner`

2. **Node.js Installed** ✅
   - Version: v24.11.0 (LTS)
   - npm Version: 11.6.1
   - Installed via: nvm (Node Version Manager)

3. **Project Dependencies Installed** ✅
   - All npm packages installed successfully
   - 18 packages installed
   - No vulnerabilities found

4. **Environment File Created** ✅
   - `.env` file created from `env.example`
   - Location: `/home/hendo420/soraScanner/.env`

## ⚠️ Pending Steps

### 1. Install PostgreSQL

PostgreSQL needs to be installed with sudo privileges. Run:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
```

After installation, start the PostgreSQL service:

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Configure Environment Variables

Edit the `.env` file and add your Sora API credentials:

```bash
nano .env
```

Required variables (refer to README.md for how to obtain these):
- `AUTH_BEARER_TOKEN` - Your Sora API JWT token
- `COOKIE_SESSION` - Session cookie
- `CF_CLEARANCE` - Cloudflare clearance
- `CF_BM` - Cloudflare BM
- `OAI_SC` - OpenAI SC
- `OAI_DID` - OpenAI DID
- `USER_AGENT` - Browser user agent
- `ACCEPT_LANGUAGE` - Accept language header
- `DB_PASSWORD` - Update from 'your_password_here' to your actual postgres password

### 3. Run Setup Script

After PostgreSQL is installed, run:

```bash
# Load nvm first
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Run setup
cd /home/hendo420/soraScanner
npm run setup
```

This will:
- Create the database
- Initialize database tables
- Test database connection

### 4. Start the Scanner

Once setup is complete, start the scanner:

```bash
# Option 1: Direct execution
npm run scanner

# Option 2: Using PM2 (recommended for production)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 logs sora-feed-scanner
```

## 📝 Quick Commands Reference

```bash
# Load Node.js environment (run this in each new terminal)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Navigate to project
cd /home/hendo420/soraScanner

# Start scanner
npm run scanner

# View scanner logs (if using PM2)
pm2 logs sora-feed-scanner

# Stop scanner (if using PM2)
pm2 stop sora-feed-scanner

# Refresh cookies
npm run refresh-cookies
```

## 📚 Documentation

- **Main README**: `README.md`
- **Database Setup**: `docs/DATABASE_SETUP.md`
- **Database Schema**: `docs/DATABASE_SCHEMA.md`
- **API Documentation**: `docs/API-Doc.md`

## 🆘 Troubleshooting

### If nvm is not found in new terminal sessions:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Or add this to your `~/.bashrc`:

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
```

### PostgreSQL Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# If not running, start it
sudo systemctl start postgresql

# Check if you can connect
psql -U postgres -d sora_feed
```

## 🎯 Next Steps Summary

1. ⬜ Install PostgreSQL (requires sudo)
2. ⬜ Configure `.env` with API credentials
3. ⬜ Run `npm run setup`
4. ⬜ Start the scanner with `npm run scanner`

---

**Setup initiated on**: October 29, 2025
**Node.js Version**: v24.11.0
**Project**: Sora Feed Scanner (scanner branch)

