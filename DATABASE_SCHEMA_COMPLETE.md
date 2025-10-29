# Complete Database Schema - Sora Scanner

## ✅ All Tables Verified

### 1. **sora_posts** (2.7 GB)
Main posts table with simplified schema:
```sql
- id (TEXT, PRIMARY KEY)
- posted_at (BIGINT, indexed)
- orientation (TEXT: 'wide', 'tall', 'square', indexed)
- duration (NUMERIC(5,2), indexed)
- prompt (TEXT, full-text search indexed)
- indexed_at (TIMESTAMP, indexed)
```

**Total Posts:** 4,608,000+

### 2. **scanner_stats** (80 KB)
Scanner statistics and status:
```sql
- id (SERIAL PRIMARY KEY)
- total_scanned (INTEGER)
- new_posts (INTEGER)
- duplicate_posts (INTEGER)
- errors (INTEGER)
- last_scan_at (TIMESTAMP, indexed)
- scan_duration_ms (INTEGER)
- status (TEXT)
- error_message (TEXT)
- last_scan_count (INTEGER)
- avg_posts_per_second (NUMERIC(10,2))
- current_poll_interval (INTEGER)
- scanner_started_at (TIMESTAMP)
- last_error_at (TIMESTAMP)
- last_overlap_pct (NUMERIC(5,2))
- last_posts_per_second (NUMERIC(10,2))
- last_new_posts (INTEGER)
- last_duplicate_posts (INTEGER)
- last_duplicates (INTEGER)
```

### 3. **scanner_scan_history** (48 KB)
Historical scan records:
```sql
- id (SERIAL PRIMARY KEY)
- started_at (TIMESTAMP, indexed)
- completed_at (TIMESTAMP)
- duration_ms (INTEGER)
- fetch_count (INTEGER)
- new_posts (INTEGER)
- duplicate_posts (INTEGER)
- overlap_pct (NUMERIC(5,2))
- posts_per_second (NUMERIC(10,2))
- poll_interval_ms (INTEGER)
- status (TEXT)
- error_message (TEXT)
```

## 🚀 Ready to Run

All required tables and columns are present. The scanner should now run without any schema errors!

### Start Scanner:
```bash
cd /home/hendo420/soraScanner && npm run scanner
```

### View Stats Dashboard:
```
http://localhost:4000
```

## 📊 Database Statistics

- **Total Size:** 2.7 GB
- **Posts:** 4.6M+
- **Average per post:** ~614 bytes
- **All fields fully indexed** for optimal query performance

