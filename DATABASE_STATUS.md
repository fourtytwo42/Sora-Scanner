# 📊 Database Status - Sora Scanner

## ✅ Database Setup Complete!

**Date**: October 29, 2025  
**Status**: READY

---

## Database Configuration

- **Host**: localhost
- **Port**: 5432
- **Database**: sora_feed
- **User**: postgres
- **Password**: ✓ Configured
- **PostgreSQL Version**: 17.6

---

## Tables Created

### 1. `creators` Table
Stores user/creator profile information:
- `id` (PRIMARY KEY)
- `username`
- `display_name`
- `profile_picture_url`
- `permalink`
- `follower_count`, `following_count`, `post_count`
- `verified`
- `first_seen`, `last_updated`

### 2. `sora_posts` Table
Stores video post data:
- `id` (PRIMARY KEY)
- `creator_id` (FOREIGN KEY → creators.id)
- `text`
- `posted_at`, `updated_at`
- `permalink`
- `video_url`, `video_url_md`
- `thumbnail_url`, `gif_url`
- `width`, `height`
- `generation_id`, `task_id`
- `like_count`, `view_count`, `remix_count`
- `indexed_at`, `last_updated`

### 3. `scanner_stats` Table
Tracks scanner performance:
- `id` (PRIMARY KEY)
- `scan_timestamp`
- `posts_fetched`
- `new_posts`, `duplicate_posts`
- `scan_duration_ms`
- `error_message`, `status`

---

## Indexes Created

Performance indexes for fast queries:
- ✅ `idx_sora_posts_creator_id` - Creator lookups
- ✅ `idx_sora_posts_posted_at` - Time-based queries
- ✅ `idx_sora_posts_indexed_at` - Recent posts
- ✅ `idx_creators_username` - Username searches
- ✅ `idx_scanner_stats_timestamp` - Stats queries

---

## Extensions Enabled

- ✅ `pg_trgm` - Fuzzy text matching support

---

## Environment Configuration Status

### ✅ Configured
- `AUTH_BEARER_TOKEN` ✓
- `OAI_SC` ✓
- `OAI_DID` ✓
- `USER_AGENT` ✓
- `ACCEPT_LANGUAGE` ✓
- `DB_HOST` ✓
- `DB_PORT` ✓
- `DB_NAME` ✓
- `DB_USER` ✓
- `DB_PASSWORD` ✓

### ⚠️ Still Needed (for full functionality)
- `COOKIE_SESSION` - Session cookie from browser
- `CF_CLEARANCE` - Cloudflare clearance token
- `CF_BM` - Cloudflare BM cookie

These cookies need to be extracted from your browser when logged into https://sora.chatgpt.com

---

## How to Get Missing Cookies

1. Open Chrome/Opera and go to https://sora.chatgpt.com
2. Open DevTools (F12)
3. Go to Application → Cookies → https://sora.chatgpt.com
4. Copy these cookie values:
   - `__Secure-next-auth.session-token` → `COOKIE_SESSION`
   - `cf_clearance` → `CF_CLEARANCE`
   - `__cf_bm` → `CF_BM`
5. Add them to your `.env` file

---

## Next Steps

### Option 1: Start Scanner Now (may work with current tokens)
```bash
# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Start scanner
cd /home/hendo420/soraScanner
npm run scanner
```

### Option 2: Add Missing Cookies First (recommended)
1. Get the missing cookies from your browser
2. Update `.env` file with the cookie values
3. Then start the scanner

### Option 3: Use PM2 (Production)
```bash
# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs sora-feed-scanner

# Monitor
pm2 status
```

---

## Test Database Connection

```bash
psql -U postgres -d sora_feed -c "SELECT * FROM scanner_stats;"
```

---

## Useful Commands

```bash
# View all tables
psql -U postgres -d sora_feed -c "\dt"

# Count posts
psql -U postgres -d sora_feed -c "SELECT COUNT(*) FROM sora_posts;"

# View recent scans
psql -U postgres -d sora_feed -c "SELECT * FROM scanner_stats ORDER BY scan_timestamp DESC LIMIT 5;"

# View creators
psql -U postgres -d sora_feed -c "SELECT username, post_count FROM creators;"
```

---

**Database Ready!** ✨ Your Sora Scanner database is fully configured and ready to collect data.

