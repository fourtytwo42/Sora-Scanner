# 🎬 Sora Feed Scanner

An automated data collection system for Sora-generated videos with PostgreSQL-powered indexing and real-time monitoring.

## ✨ Features

- 🔄 **Automated Scanning** - Continuous monitoring of Sora API for new posts
- 🗄️ **PostgreSQL Backend** - Robust database with duplicate detection
- 📊 **Performance Monitoring** - Real-time scanner statistics and error tracking
- 📈 **Live Dashboard** - Built-in HTML dashboard with database health & scan history
- 🔐 **Authentication Handling** - Automatic JWT token validation and error reporting
- 🍪 **Automatic Cookie Management** - Refreshes Cloudflare cookies every 12 hours and on error detection
- ⚡ **High Performance** - Optimized polling with dynamic timing adjustment
- 🛡️ **Error Recovery** - Automatic retry logic and rate limiting
- 📝 **Comprehensive Logging** - Detailed logs for debugging and monitoring

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/fourtytwo42/soraFeed.git
cd soraFeed
git checkout scanner
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` and add your credentials:

```env
# Sora API Authentication
AUTH_BEARER_TOKEN=your_jwt_token_here
COOKIE_SESSION=your_session_cookie
CF_CLEARANCE=your_cloudflare_clearance
CF_BM=your_cloudflare_bm
OAI_SC=your_oai_sc
OAI_DID=your_oai_did

# Headers
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
ACCEPT_LANGUAGE=en-US,en;q=0.9,fr;q=0.8

# API Config
FEED_LIMIT=16
FEED_CUT=nf2_latest

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sora_feed
DB_USER=postgres
DB_PASSWORD=postgres
```

### 3. Run Setup (One Command!)

```bash
npm run setup
```

This single command will:
- ✅ Install PostgreSQL (if not installed)
- ✅ Create and configure the database
- ✅ Initialize database tables with proper schema
- ✅ Test database connection
- ✅ Install all npm dependencies

### 4. Start the Scanner

**Option 1: Direct execution**
```bash
npm run scanner
```

**Option 2: Using PM2 (recommended for production)**
```bash
pm2 start ecosystem.config.js
pm2 logs sora-feed-scanner
```

Once the scanner is running you can open the live dashboard at `http://localhost:4000` (configurable via `STATS_PORT`/`STATS_HOST`).

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Complete setup (PostgreSQL + database + dependencies) |
| `npm run scanner` | Start scanner service |
| `npm start` | Start scanner service (alias for scanner) |
| `npm run refresh-cookies` | Refresh authentication cookies |
| `npm run update-cookies` | Update cookies from browser |

## 📈 Live Dashboard

- Serves automatically from the scanner at `http://localhost:4000` (configurable with `STATS_HOST`/`STATS_PORT`)
- Displays database totals, recent scan health, orientation distribution, and a rolling seven-day activity view
- JSON stats also available at `/api/stats` for integrating with other tooling
- Lightweight Node.js server with auto-refresh every 30 seconds

## 🗂️ Project Structure

```
soraFeed/
├── src/                       # Main application source code
│   ├── scanner.js            # Main scanner application
│   ├── setup.cjs             # Automated database setup script
│   └── utils/                # Utility scripts
│       ├── refresh-cookies.js # Cookie refresh utility
│       └── update-cookies.js  # Cookie update utility
├── migrations/               # Database migrations
├── docs/                     # Documentation
├── ecosystem.config.js       # PM2 configuration
├── .env                      # Environment variables
└── package.json
```

## 🎯 Scanner Features

### Automated Data Collection
- Polls Sora API every 8-10 seconds (dynamic timing)
- Fetches latest 200 posts per scan
- Automatic duplicate detection and filtering
- Real-time performance monitoring

### Database Schema
- **creators** - User profile information
- **sora_posts** - Video post data with metadata
- **scanner_stats** - Performance and error tracking

### Error Handling
- JWT token validation and expiration detection
- HTTP status code monitoring (401, 403, etc.)
- Automatic retry logic with exponential backoff
- Comprehensive error logging

### Performance Optimization
- Dynamic polling interval adjustment based on overlap
- Memory usage monitoring and restart protection
- Efficient database indexing for fast queries
- Connection pooling for database operations

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_BEARER_TOKEN` | Sora API JWT token | Required |
| `COOKIE_SESSION` | Session cookie | Required |
| `CF_CLEARANCE` | Cloudflare clearance | Required |
| `CF_BM` | Cloudflare BM | Required |
| `OAI_SC` | OpenAI SC | Required |
| `OAI_DID` | OpenAI DID | Required |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | sora_feed |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | postgres |
| `STATS_PORT` | Port for the stats dashboard | 4000 |
| `STATS_HOST` | Bind address for the stats dashboard | 0.0.0.0 |

### Scanner Settings

Edit `src/scanner.js` to customize:
- Scan frequency (default: 8-10 seconds, dynamic)
- Posts per scan (default: 200)
- API endpoint and parameters
- Error handling and retry logic

## 📊 Database Schema

### creators
- `id` (PRIMARY KEY) - User ID
- `username` - Username
- `display_name` - Display name
- `profile_picture_url` - Profile picture
- `permalink` - Profile URL
- `follower_count`, `following_count`, `post_count` - Stats
- `verified` - Verification status
- `first_seen`, `last_updated` - Timestamps

### sora_posts
- `id` (PRIMARY KEY) - Post ID
- `creator_id` (FOREIGN KEY) - References creators.id
- `text` - Post caption
- `posted_at`, `updated_at` - Timestamps
- `permalink` - Post URL
- `video_url`, `video_url_md` - Video URLs
- `thumbnail_url`, `gif_url` - Media URLs
- `width`, `height` - Video dimensions
- `generation_id`, `task_id` - Generation metadata
- `like_count`, `view_count`, `remix_count` - Engagement
- `indexed_at`, `last_updated` - Timestamps

### scanner_stats
- `total_scanned`, `new_posts`, `duplicate_posts`, `errors`
- `last_scan_at`, `scan_duration_ms`, `current_poll_interval`
- `last_overlap_pct`, `last_posts_per_second`, `last_new_posts`, `last_duplicates`
- `consecutive_errors`, `last_error_at`, `scanner_started_at`

### scanner_scan_history
- `started_at`, `completed_at`, `duration_ms`
- `fetch_count`, `new_posts`, `duplicate_posts`
- `overlap_pct`, `posts_per_second`, `poll_interval_ms`
- `status`, `error_message`

## 🐛 Troubleshooting

### Scanner Not Working

```bash
# Check scanner logs
pm2 logs sora-feed-scanner

# Check for authentication errors
grep "AUTHENTICATION ERROR" logs/scanner-error.log

# Verify API token in .env
cat .env | grep AUTH_BEARER_TOKEN
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Reset database
npm run setup
```

### JWT Token Issues

The scanner will automatically detect JWT token problems and log:
- `🔐 HTTP 401 Unauthorized: Authentication failed`
- `🔐 AUTHENTICATION ERROR: JWT token may be invalid or expired`

### Cookie Management

The scanner automatically handles Cloudflare cookies:
- **Automatic refresh every 12 hours** - No manual intervention needed
- **Error-based refresh** - Automatically refreshes when cookie-related errors are detected
- **Manual refresh available** - For troubleshooting if needed

```bash
# Manual cookie refresh (if needed for troubleshooting)
npm run refresh-cookies
```

Update your `AUTH_BEARER_TOKEN` in `.env` and restart the scanner.

## 🚀 Deployment

### Using PM2 (Recommended)

```bash
# Start scanner
pm2 start ecosystem.config.js

# Monitor logs
pm2 logs sora-feed-scanner

# Restart scanner
pm2 restart sora-feed-scanner

# Stop scanner
pm2 stop sora-feed-scanner
```


## 📚 Documentation

- **[Database Setup](docs/DATABASE_SETUP.md)** - PostgreSQL setup guide
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - Database structure and design
- **[API Documentation](docs/API-Doc.md)** - Sora API reference

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch from `scanner`
3. Make your changes
4. Submit a pull request to the `scanner` branch

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with Node.js and PostgreSQL
- Powered by the Sora API
- PM2 for process management

---

**Made with ❤️ for the Sora community**
