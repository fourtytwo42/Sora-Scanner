const { Pool } = require('pg');
const https = require('https');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sora_feed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 10, // Reduced connection pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Configuration
const FETCH_LIMIT = 200;
const MIN_POLL_INTERVAL = 6000;
const MAX_POLL_INTERVAL = 30000;
const BASE_POLL_INTERVAL = 10000;
const TARGET_OVERLAP_PERCENTAGE = 30;

// State
let isScanning = false;
let scanInterval = BASE_POLL_INTERVAL;
let lastScanPostIds = new Set();
let consecutiveErrors = 0;
let scanHistory = [];
const MAX_HISTORY = 6;

// Calculate orientation from width/height
function getOrientation(width, height) {
  if (!width || !height) return 'square';
  const ratio = width / height;
  if (ratio > 1.1) return 'wide';
  if (ratio < 0.9) return 'tall';
  return 'square';
}

// Convert n_frames to duration in seconds
function framesToDuration(nFrames) {
  if (!nFrames || nFrames <= 0) return 0;
  // Sora uses 30 fps: 300 frames = 10 seconds
  return parseFloat((nFrames / 30).toFixed(2));
}

// Fetch feed from Sora API
async function fetchSoraFeed(limit = FETCH_LIMIT) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`,
      method: 'GET',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'SoraScanner/2.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'Cookie': [
          process.env.COOKIE_SESSION && `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
          process.env.CF_CLEARANCE && `cf_clearance=${process.env.CF_CLEARANCE}`,
          process.env.CF_BM && `__cf_bm=${process.env.CF_BM}`,
          process.env.OAI_DID && `oai-did=${process.env.OAI_DID}`
        ].filter(Boolean).join('; ')
      }
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`API Error: ${JSON.stringify(json.error)}`));
            return;
          }
          if (!json.items || !Array.isArray(json.items)) {
            reject(new Error('Invalid API response'));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Process and store posts
async function processPosts(feedData) {
  const client = await pool.connect();
  let newPosts = 0;
  let duplicates = 0;
  
  try {
    await client.query('BEGIN');

    for (const item of feedData.items) {
      const { post } = item;
      
      // Check if exists
      const exists = await client.query(
        'SELECT id FROM sora_posts WHERE id = $1',
        [post.id]
      );

      if (exists.rows.length > 0) {
        duplicates++;
        continue;
      }

      // Extract video metadata
      const attachment = post.attachments?.[0] || {};
      const width = attachment.width;
      const height = attachment.height;
      const nFrames = attachment.n_frames;
      
      // Process data
      const orientation = getOrientation(width, height);
      const duration = framesToDuration(nFrames);
      const prompt = post.text || null;
      const postedAt = Math.floor(post.posted_at || Date.now() / 1000);

      // Insert post with minimal data
      await client.query(
        `INSERT INTO sora_posts (id, posted_at, orientation, duration, prompt)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [post.id, postedAt, orientation, duration, prompt]
      );

      newPosts++;
    }

    await client.query('COMMIT');
    return { newPosts, duplicates, total: feedData.items.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Calculate overlap percentage
function calculateOverlap(currentIds) {
  if (lastScanPostIds.size === 0) return 0;
  const overlap = [...currentIds].filter(id => lastScanPostIds.has(id)).length;
  return (overlap / currentIds.size) * 100;
}

// Adjust poll interval based on overlap
function adjustPollInterval(overlapPct) {
  let newInterval = scanInterval;
  
  if (overlapPct < TARGET_OVERLAP_PERCENTAGE - 5) {
    newInterval = Math.max(MIN_POLL_INTERVAL, scanInterval - 500);
    console.log(`⏰ Low overlap (${overlapPct.toFixed(1)}%) → faster polling: ${(newInterval/1000).toFixed(1)}s`);
  } else if (overlapPct > TARGET_OVERLAP_PERCENTAGE + 10) {
    newInterval = Math.min(MAX_POLL_INTERVAL, scanInterval + 1000);
    console.log(`⏰ High overlap (${overlapPct.toFixed(1)}%) → slower polling: ${(newInterval/1000).toFixed(1)}s`);
  }
  
  return Math.round(newInterval / 100) * 100;
}

// Update statistics
async function updateStats(stats, duration, error = null) {
  try {
    const avgPostsPerSec = scanHistory.length > 0
      ? scanHistory.reduce((sum, h) => sum + h.postsPerSec, 0) / scanHistory.length
      : 0;

    await pool.query(
      `UPDATE scanner_stats SET
        total_scanned = total_scanned + $1,
        new_posts = new_posts + $2,
        duplicate_posts = duplicate_posts + $3,
        errors = errors + $4,
        last_scan_at = CURRENT_TIMESTAMP,
        scan_duration_ms = $5,
        status = $6,
        error_message = $7,
        last_scan_count = $8,
        avg_posts_per_second = $9,
        current_poll_interval = $10
      WHERE id = 1`,
      [
        stats.total || 0,
        stats.newPosts || 0,
        stats.duplicates || 0,
        error ? 1 : 0,
        duration,
        error ? 'error' : 'success',
        error?.message || null,
        stats.total || 0,
        avgPostsPerSec.toFixed(2),
        scanInterval
      ]
    );
  } catch (err) {
    console.error('Stats update failed:', err.message);
  }
}

// Main scan function
async function scanFeed() {
  if (isScanning) {
    console.log(`⏸️  Scan in progress, skipping...`);
    return;
  }

  isScanning = true;
  const start = Date.now();
  console.log(`\n🔍 [${new Date().toISOString()}] Scanning (limit: ${FETCH_LIMIT})...`);

  try {
    await pool.query(`UPDATE scanner_stats SET status = 'scanning' WHERE id = 1`);

    const feedData = await fetchSoraFeed(FETCH_LIMIT);
    const count = feedData.items?.length || 0;
    console.log(`📥 Fetched ${count} posts`);

    const result = await processPosts(feedData);
    const duration = Date.now() - start;
    
    // Calculate metrics
    const currentIds = new Set(feedData.items?.map(i => i.post.id) || []);
    const overlap = calculateOverlap(currentIds);
    const postsPerSec = count / (duration / 1000);
    
    // Update history
    scanHistory.push({ postsPerSec, timestamp: Date.now() });
    if (scanHistory.length > MAX_HISTORY) scanHistory.shift();
    
    // Update for next scan
    lastScanPostIds = currentIds;

    console.log(`✅ Complete: ${result.newPosts} new, ${result.duplicates} dup, ${overlap.toFixed(1)}% overlap, ${postsPerSec.toFixed(1)} posts/s, ${(duration/1000).toFixed(1)}s`);

    // Adjust timing
    scanInterval = adjustPollInterval(overlap);

    await updateStats(result, duration);
    consecutiveErrors = 0;

  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Scan error: ${error.message}`);
    await updateStats({}, duration, error);
    
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      scanInterval = Math.min(scanInterval * 2, MAX_POLL_INTERVAL);
      console.log(`🐌 Rate limiting: ${consecutiveErrors} errors, interval: ${scanInterval/1000}s`);
    }
  } finally {
    isScanning = false;
  }
}

// Schedule next scan
function scheduleNext() {
  setTimeout(() => {
    scanFeed().then(scheduleNext).catch(err => {
      console.error('Scan failed:', err.message);
      scheduleNext();
    });
  }, scanInterval);
}

// Main
async function main() {
  try {
    console.log('🚀 Sora Scanner v2.0 - Simplified');
    console.log(`📊 Database: ${process.env.DB_NAME || 'sora_feed'}`);
    
    // Test connection
    const client = await pool.connect();
    const version = await client.query('SELECT version()');
    console.log(`✅ PostgreSQL connected: ${version.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    client.release();

    // Initial scan
    await scanFeed();

    // Schedule
    console.log(`⏰ Scheduling scans every ${scanInterval/1000}s...`);
    scheduleNext();

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

// Start
main();

