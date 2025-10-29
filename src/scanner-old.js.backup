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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Simplified configuration - fixed batch size, dynamic timing
const FIXED_FETCH_LIMIT = 200; // Fixed at 200 posts for optimal performance
const TARGET_OVERLAP_PERCENTAGE = 30; // Target 30% overlap to ensure no missed posts
const MIN_POLL_INTERVAL = 6000; // 6 seconds minimum
const MAX_POLL_INTERVAL = 30000; // 30 seconds maximum
const BASE_POLL_INTERVAL = 10000; // 10 seconds starting point
const TIMING_INCREMENT = 100; // 100ms increments for granular timing

// Performance tracking for overlap-based timing
let scanPerformanceHistory = [];
const MAX_PERFORMANCE_HISTORY = 6; // Track last 6 polling events for videos/second
let lastScanPostIds = new Set(); // Track post IDs from last scan for overlap detection

// Scan lock to prevent overlapping scans
let isScanning = false;
const MAX_SCAN_DURATION = 300000; // 5 minutes maximum scan duration

// Rate limiting
let consecutiveErrors = 0;
let scanInterval = BASE_POLL_INTERVAL; // Start with 10 seconds

// Cookie management
let lastCookieRefresh = Date.now();
const COOKIE_REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours

// Track previous scan count for change calculation
let previousScanCount = 0;

// Simple overlap-based timing adjustment with granular precision
function calculateOptimalPollInterval(overlapPercentage) {
  const currentInterval = scanInterval;
  let newInterval = currentInterval;
  let reasoning = '';
  
  if (overlapPercentage < TARGET_OVERLAP_PERCENTAGE - 5) {
    // Too little overlap - risk missing posts, poll more frequently
    // Use smaller adjustments for more precision
    newInterval = Math.max(MIN_POLL_INTERVAL, currentInterval - 500); // Reduce by 500ms
    reasoning = `low overlap (${overlapPercentage.toFixed(1)}% < ${TARGET_OVERLAP_PERCENTAGE}%)`;
  } else if (overlapPercentage > TARGET_OVERLAP_PERCENTAGE + 10) {
    // Too much overlap - inefficient, poll less frequently
    newInterval = Math.min(MAX_POLL_INTERVAL, currentInterval + 1000); // Increase by 1s
    reasoning = `high overlap (${overlapPercentage.toFixed(1)}% > ${TARGET_OVERLAP_PERCENTAGE}%)`;
  }
  
  // Round to nearest 100ms for granular intervals
  newInterval = Math.round(newInterval / TIMING_INCREMENT) * TIMING_INCREMENT;
  
  if (newInterval !== currentInterval && reasoning) {
    console.log(`⏰ Timing adjustment: ${reasoning} → interval ${(currentInterval/1000).toFixed(1)}s → ${(newInterval/1000).toFixed(1)}s`);
  }
  
  return newInterval;
}

// Calculate overlap percentage with previous scan
function calculateOverlapPercentage(currentPostIds) {
  if (lastScanPostIds.size === 0) {
    return 0; // First scan, no overlap possible
  }
  
  const intersection = new Set([...currentPostIds].filter(id => lastScanPostIds.has(id)));
  const overlapCount = intersection.size;
  const overlapPercentage = (overlapCount / currentPostIds.size) * 100;
  
  return overlapPercentage;
}

// Update performance history for videos/second tracking
function updatePerformanceHistory(metrics) {
  const uniqueVideosPerSecond = metrics.newPosts / (metrics.duration / 1000);
  
  scanPerformanceHistory.push({
    timestamp: metrics.timestamp,
    videosPerSecond: metrics.postsPerSecond, // Total posts (including duplicates)
    uniqueVideosPerSecond: uniqueVideosPerSecond, // Only new/unique posts
    duration: metrics.duration,
    totalPosts: metrics.totalPosts,
    newPosts: metrics.newPosts,
    duplicates: metrics.duplicates,
    overlapPercentage: metrics.overlapPercentage
  });
  
  if (scanPerformanceHistory.length > MAX_PERFORMANCE_HISTORY) {
    scanPerformanceHistory.shift(); // Keep only last 6 polling events
  }
}

// Calculate average videos per second over recent polling events
function getAverageVideosPerSecond() {
  if (scanPerformanceHistory.length === 0) return 0;
  
  const totalVideosPerSecond = scanPerformanceHistory.reduce((sum, h) => sum + h.videosPerSecond, 0);
  return totalVideosPerSecond / scanPerformanceHistory.length;
}

// Calculate average unique videos per second over recent polling events
function getAverageUniqueVideosPerSecond() {
  if (scanPerformanceHistory.length === 0) return 0;
  
  const totalUniqueVideosPerSecond = scanPerformanceHistory.reduce((sum, h) => sum + h.uniqueVideosPerSecond, 0);
  return totalUniqueVideosPerSecond / scanPerformanceHistory.length;
}

// Check if cookies need refresh
function shouldRefreshCookies() {
  return Date.now() - lastCookieRefresh > COOKIE_REFRESH_INTERVAL;
}

// Refresh cookies using the refresh script
async function refreshCookies() {
  try {
    console.log('🔄 Refreshing cookies...');
    const { refreshCookies: refreshFn } = require('./utils/refresh-cookies.js');
    await refreshFn();
    lastCookieRefresh = Date.now();
    console.log('✅ Cookies refreshed successfully');
    return true;
  } catch (error) {
    console.error('❌ Cookie refresh failed:', error.message);
    return false;
  }
}

// Fetch feed from Sora API with dynamic limit
async function fetchSoraFeed(limit = FIXED_FETCH_LIMIT) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`,
      method: 'GET',
      timeout: 30000, // 30 second timeout
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_BEARER_TOKEN}`,
        'User-Agent': process.env.USER_AGENT || 'SoraFeedScanner/1.0',
        'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
        'Cookie': [
          `__Secure-next-auth.session-token=${process.env.COOKIE_SESSION}`,
          `cf_clearance=${process.env.CF_CLEARANCE}`,
          `__cf_bm=${process.env.CF_BM}`,
          `oai-sc=${process.env.OAI_SC}`,
          `oai-did=${process.env.OAI_DID}`
        ].filter(Boolean).join('; ')
      }
    };

    const req = https.get(options, (res) => {
      let data = '';

      // Log HTTP status code for debugging
      console.log(`🌐 HTTP Status: ${res.statusCode} ${res.statusMessage}`);

      // Check for authentication-related HTTP status codes
      if (res.statusCode === 401) {
        console.log(`🔐 HTTP 401 Unauthorized: Authentication failed. JWT token may be invalid or expired.`);
      } else if (res.statusCode === 403) {
        console.log(`🔐 HTTP 403 Forbidden: Access denied. Check your authentication credentials.`);
      } else if (res.statusCode >= 400) {
        console.log(`❌ HTTP ${res.statusCode}: Request failed`);
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          // Debug logging for API response
          console.log(`🔍 API Response Debug:`);
          console.log(`   - Items count: ${jsonData.items?.length || 0}`);
          console.log(`   - Has cursor: ${!!jsonData.cursor}`);
          console.log(`   - Response keys: ${Object.keys(jsonData).join(', ')}`);
          
          // Check if the response contains an error
          if (jsonData.error) {
            // Log the full error object for debugging
            console.log(`❌ API Error Details:`, JSON.stringify(jsonData.error, null, 2));
            
            // Check for specific error types
            if (jsonData.error.message) {
              console.log(`❌ API Error Message: ${jsonData.error.message}`);
            }
            if (jsonData.error.code) {
              console.log(`❌ API Error Code: ${jsonData.error.code}`);
            }
            if (jsonData.error.type) {
              console.log(`❌ API Error Type: ${jsonData.error.type}`);
            }
            
            // Check for authentication/JWT related errors
            if (jsonData.error.message && (
              jsonData.error.message.includes('token') || 
              jsonData.error.message.includes('auth') || 
              jsonData.error.message.includes('unauthorized') ||
              jsonData.error.message.includes('invalid') ||
              jsonData.error.message.includes('expired')
            )) {
              console.log(`🔐 AUTHENTICATION ERROR: JWT token may be invalid or expired. Please check your AUTH_BEARER_TOKEN in .env file.`);
            }
            
            reject(new Error(`API Error: ${JSON.stringify(jsonData.error)}`));
            return;
          }
          
          // Check if we have the expected structure
          if (!jsonData.items || !Array.isArray(jsonData.items)) {
            console.log(`❌ Invalid API response structure. Expected 'items' array, got:`, Object.keys(jsonData));
            reject(new Error(`Invalid API response structure. Expected 'items' array, got: ${Object.keys(jsonData).join(', ')}`));
            return;
          }
          
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    });

    // Set a manual timeout as backup
    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    }, 30000);

    req.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

// Fetch feed with retry logic (fixed at 200 posts)
async function fetchSoraFeedWithRetry(limit = FIXED_FETCH_LIMIT) {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const feedData = await fetchSoraFeed(limit);
      const postCount = feedData.items?.length || 0;
      
      if (postCount > 0) {
        if (attempts > 0) {
          console.log(`✅ Successfully fetched ${postCount} posts with limit ${limit}`);
        }
        return feedData;
      }
      
      attempts++;
      
      if (attempts === 1) {
        console.log(`📊 Got ${postCount} posts on first try (requested ${limit})`);
        console.log(`🔄 Retrying with higher limit...`);
      } else {
        console.log(`⚠️  Got ${postCount} posts, attempt ${attempts}/${maxAttempts}`);
      }
      
      if (attempts < maxAttempts) {
        // Increase limit for next attempt
        limit = limit + 50;
        console.log(`🔄 Retrying with limit ${limit}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw error;
      }
      console.log(`⚠️  Fetch error on attempt ${attempts}/${maxAttempts}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds on error
    }
  }
  
  // If we still don't have any posts after all attempts, try one more time with original limit
  console.log(`⚠️  Retrying with original limit ${FIXED_FETCH_LIMIT} as final attempt...`);
  return await fetchSoraFeed(FIXED_FETCH_LIMIT);
}

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Initializing database...');

    // Enable pg_trgm extension for fuzzy matching
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');
    } catch (error) {
      console.log('⚠️ pg_trgm extension check:', error);
    }

    // Create creators table
    await client.query(`
      CREATE TABLE IF NOT EXISTS creators (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        profile_picture_url TEXT,
        permalink TEXT,
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT false,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Remove the username unique constraint if it exists (causes conflicts)
    try {
      await client.query(`ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_username_key`);
    } catch (error) {
      // Constraint might not exist, ignore error
    }

    // Create posts table (normalized schema)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sora_posts (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES creators(id),
        text TEXT,
        posted_at BIGINT NOT NULL,
        updated_at BIGINT,
        permalink TEXT NOT NULL,
        
        -- Video metadata
        video_url TEXT,
        video_url_md TEXT,
        thumbnail_url TEXT,
        gif_url TEXT,
        width INTEGER,
        height INTEGER,
        generation_id TEXT,
        task_id TEXT,
        
        -- Engagement metrics
        like_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        remix_count INTEGER DEFAULT 0,
        
        -- Tracking
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for creators
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_creators_username ON creators(username);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_creators_verified ON creators(verified) WHERE verified = true;
    `);

    // Create indexes for posts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON sora_posts(creator_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON sora_posts(posted_at DESC);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_indexed_at ON sora_posts(indexed_at DESC);
    `);

    // Full-text search index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_text_fts ON sora_posts USING gin(to_tsvector('english', COALESCE(text, '')));
    `);

    // Trigram index for fuzzy matching
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_posts_text_trgm 
        ON sora_posts USING gin(text gin_trgm_ops)
      `);
      console.log('✅ Trigram index created');
    } catch (error) {
      console.log('⚠️ Trigram index check:', error);
    }

    // Create scanner_stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_stats (
        id SERIAL PRIMARY KEY,
        total_scanned INTEGER DEFAULT 0,
        new_posts INTEGER DEFAULT 0,
        duplicate_posts INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        last_scan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scan_duration_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'idle',
        error_message TEXT,
        last_scan_count INTEGER DEFAULT 0,
        previous_scan_count INTEGER DEFAULT 0,
        last_scan_duplicates INTEGER DEFAULT 0,
        last_scan_unique INTEGER DEFAULT 0,
        avg_videos_per_second DECIMAL(10,2) DEFAULT 0,
        avg_unique_videos_per_second DECIMAL(10,2) DEFAULT 0,
        current_poll_interval INTEGER DEFAULT 10000,
        previous_poll_interval INTEGER DEFAULT 10000
      );
    `);
    
    // Add new columns if they don't exist (for existing databases)
    try {
      await client.query(`
        ALTER TABLE scanner_stats 
        ADD COLUMN IF NOT EXISTS avg_videos_per_second DECIMAL(10,2) DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE scanner_stats 
        ADD COLUMN IF NOT EXISTS avg_unique_videos_per_second DECIMAL(10,2) DEFAULT 0
      `);
      await client.query(`
        ALTER TABLE scanner_stats 
        ADD COLUMN IF NOT EXISTS current_poll_interval INTEGER DEFAULT 10000
      `);
      await client.query(`
        ALTER TABLE scanner_stats 
        ADD COLUMN IF NOT EXISTS previous_poll_interval INTEGER DEFAULT 10000
      `);
    } catch (error) {
      // Columns might already exist, ignore error
    }

    // Initialize scanner_stats if empty
    const statsCheck = await client.query('SELECT COUNT(*) FROM scanner_stats');
    if (parseInt(statsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO scanner_stats (total_scanned, new_posts, duplicate_posts, errors, status, avg_videos_per_second, avg_unique_videos_per_second, current_poll_interval, previous_poll_interval)
        VALUES (0, 0, 0, 0, 'idle', 0, 0, 10000, 10000)
      `);
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Process and store posts
async function processPosts(feedData) {
  const client = await pool.connect();
  let newPosts = 0;
  let duplicates = 0;
  
  try {
    await client.query('BEGIN');

    for (const item of feedData.items) {
      const { post, profile } = item;
      
      // Check if post already exists
      const existCheck = await client.query(
        'SELECT id FROM sora_posts WHERE id = $1',
        [post.id]
      );

      if (existCheck.rows.length > 0) {
        duplicates++;
        continue;
      }

      // Extract video metadata from attachments
      const attachment = post.attachments?.[0] || {};
      const encodings = attachment.encodings || {};
      
      // Insert or update creator
      await client.query(`
        INSERT INTO creators (
          id, username, display_name, profile_picture_url,
          permalink, follower_count, following_count,
          post_count, verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          profile_picture_url = EXCLUDED.profile_picture_url,
          permalink = EXCLUDED.permalink,
          follower_count = EXCLUDED.follower_count,
          following_count = EXCLUDED.following_count,
          post_count = EXCLUDED.post_count,
          verified = EXCLUDED.verified,
          last_updated = CURRENT_TIMESTAMP
      `, [
        profile.user_id || profile.id,
        profile.username || `user_${profile.user_id || profile.id}`,
        profile.display_name || null,
        profile.profile_picture_url || null,
        profile.permalink || null,
        profile.follower_count || 0,
        profile.following_count || 0,
        profile.post_count || 0,
        profile.verified || false
      ]);
      
      // Insert new post into normalized schema
      await client.query(`
        INSERT INTO sora_posts (
          id, creator_id, text, posted_at, permalink,
          video_url, video_url_md, thumbnail_url, gif_url,
          width, height, generation_id, task_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `, [
        post.id,
        profile.user_id || profile.id,
        post.text || null,
        Math.floor(post.posted_at || 0),
        post.permalink || null,
        encodings.source?.path || null,
        encodings.md?.path || null,
        encodings.thumbnail?.path || null,
        encodings.gif?.path || null,
        attachment.width || null,
        attachment.height || null,
        attachment.generation_id || null,
        attachment.task_id || null
      ]);

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

// Update scanner statistics
async function updateStats(stats, duration, error = null, scanCount = 0, scanDuplicates = 0, scanUnique = 0, avgVideosPerSecond = 0, avgUniqueVideosPerSecond = 0, currentInterval = 10000) {
  try {
    // First, get the current stats to store as previous
    const currentStats = await pool.query('SELECT last_scan_count, current_poll_interval FROM scanner_stats WHERE id = 1');
    const previousScanCount = currentStats.rows[0]?.last_scan_count || 0;
    const previousInterval = currentStats.rows[0]?.current_poll_interval || 10000;
    
    await pool.query(`
      UPDATE scanner_stats
      SET 
        total_scanned = total_scanned + $1,
        new_posts = new_posts + $2,
        duplicate_posts = duplicate_posts + $3,
        errors = errors + $4,
        last_scan_at = CURRENT_TIMESTAMP,
        scan_duration_ms = $5,
        status = $6,
        error_message = $7,
        previous_scan_count = $8,
        last_scan_count = $9,
        last_scan_duplicates = $10,
        last_scan_unique = $11,
        avg_videos_per_second = $12,
        avg_unique_videos_per_second = $13,
        previous_poll_interval = $14,
        current_poll_interval = $15
      WHERE id = 1
    `, [
      stats.total || 0,
      stats.newPosts || 0,
      stats.duplicates || 0,
      error ? 1 : 0,
      duration,
      error ? 'error' : 'success',
      error ? error.message : null,
      previousScanCount,
      scanCount,
      scanDuplicates,
      scanUnique,
      avgVideosPerSecond,
      avgUniqueVideosPerSecond,
      previousInterval,
      currentInterval
    ]);
  } catch (err) {
    console.error('Failed to update stats:', err);
  }
}

// Main scan function
async function scanFeed() {
  // Check if already scanning to prevent overlaps
  if (isScanning) {
    console.log(`⏸️  [${new Date().toISOString()}] Scan already in progress, skipping... (limit: ${FIXED_FETCH_LIMIT})`);
    return;
  }

  // Set scan lock
  isScanning = true;
  const startTime = Date.now();
  console.log(`\n🔍 [${new Date().toISOString()}] Starting scan (limit: ${FIXED_FETCH_LIMIT})...`);

  // Set timeout to prevent stuck locks
  const scanTimeout = setTimeout(() => {
    if (isScanning) {
      console.error(`⏰ [${new Date().toISOString()}] Scan timeout after ${MAX_SCAN_DURATION}ms, releasing lock`);
      isScanning = false;
    }
  }, MAX_SCAN_DURATION);

  try {
    // Check if cookies need refresh
    if (shouldRefreshCookies()) {
      console.log('🍪 Cookies are stale, refreshing...');
      await refreshCookies();
    }

    // Update status to scanning
    await pool.query(`UPDATE scanner_stats SET status = 'scanning' WHERE id = 1`);

    // Fetch feed with fixed limit (200 posts)
    const feedData = await fetchSoraFeedWithRetry(FIXED_FETCH_LIMIT);
    const actualCount = feedData.items?.length || 0;
    console.log(`📥 Fetched ${actualCount} posts from API (requested ${FIXED_FETCH_LIMIT})`);
    
    // Debug: Check if there's a cursor or other pagination info
    if (feedData.cursor) {
      console.log(`🔍 API cursor present: ${feedData.cursor.substring(0, 20)}...`);
    }
    if (actualCount < FIXED_FETCH_LIMIT) {
      console.log(`⚠️  Received ${FIXED_FETCH_LIMIT - actualCount} fewer posts than requested`);
    }

    // Process posts and collect metrics
    const result = await processPosts(feedData);
    const duration = Date.now() - startTime;
    const currentScanCount = feedData.items?.length || 0;
    
    // Extract post IDs for overlap calculation
    const currentPostIds = new Set(feedData.items?.map(item => item.post.id) || []);
    const overlapPercentage = calculateOverlapPercentage(currentPostIds);
    
    // Calculate performance metrics
    const postsPerSecond = currentScanCount / (duration / 1000);
    const scanMetrics = {
      duration,
      totalPosts: currentScanCount,
      newPosts: result.newPosts,
      duplicates: result.duplicates,
      overlapPercentage,
      postsPerSecond,
      timestamp: Date.now()
    };
    
    // Update performance history
    updatePerformanceHistory(scanMetrics);
    
    // Update post IDs for next overlap calculation
    lastScanPostIds = currentPostIds;
    
    // Calculate change from previous scan
    let changeText = '';
    if (previousScanCount > 0) {
      const change = currentScanCount - previousScanCount;
      if (change > 0) {
        changeText = ` (+${change})`;
      } else if (change < 0) {
        changeText = ` (${change})`;
      } else {
        changeText = ' (=)';
      }
    }
    
    // Update previous scan count for next comparison
    previousScanCount = currentScanCount;

    console.log(`✅ Scan complete:`);
    console.log(`   - Posts scanned: ${currentScanCount}${changeText}`);
    console.log(`   - New posts: ${result.newPosts}`);
    console.log(`   - Duplicates: ${result.duplicates}`);
    console.log(`   - Overlap: ${overlapPercentage.toFixed(1)}%`);
    console.log(`   - Speed: ${postsPerSecond.toFixed(1)} videos/sec`);
    console.log(`   - Duration: ${(duration/1000).toFixed(1)}s`);
    
    // Show average videos/second over recent polling events
    const avgVideosPerSecond = getAverageVideosPerSecond();
    const avgUniqueVideosPerSecond = getAverageUniqueVideosPerSecond();
    if (scanPerformanceHistory.length >= 2) {
      console.log(`📊 Avg videos/sec (last ${scanPerformanceHistory.length} polls): ${avgVideosPerSecond.toFixed(1)} total, ${avgUniqueVideosPerSecond.toFixed(1)} unique`);
    }

    // Simple overlap-based timing adjustment
    const newInterval = calculateOptimalPollInterval(overlapPercentage);
    if (newInterval !== scanInterval) {
      scanInterval = newInterval;
    }
    
    // Update statistics
    await updateStats({
      total: result.total,
      newPosts: result.newPosts,
      duplicates: result.duplicates
    }, duration, null, currentScanCount, result.duplicates, result.newPosts, avgVideosPerSecond, avgUniqueVideosPerSecond, scanInterval);

    // Reset consecutive errors on successful scan
    if (consecutiveErrors > 0) {
      console.log(`✅ Scan successful, resetting error counter (was ${consecutiveErrors})`);
      consecutiveErrors = 0;
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Scan error:`, error.message);
    await updateStats({}, duration, error, 0, 0, 0);
    
    // Check if error is cookie-related or timeout-related
    const isCookieError = error.message.includes('JSON parse error') || 
                         error.message.includes('<!DOCTYPE') ||
                         error.message.includes('cloudflare') ||
                         error.message.includes('timeout') ||
                         error.message.includes('upstream');
    
    if (isCookieError && consecutiveErrors >= 2) {
      console.log('🍪 Detected cookie/timeout error, attempting refresh...');
      const refreshSuccess = await refreshCookies();
      if (refreshSuccess) {
        consecutiveErrors = 0; // Reset on successful refresh
        scanInterval = BASE_POLL_INTERVAL; // Reset to base interval
        console.log('✅ Cookie refresh successful, resetting error counter and interval');
      }
    }
    
    // If we have too many consecutive errors, reset everything
    if (consecutiveErrors >= 10) {
      console.log('🔄 Too many consecutive errors, resetting scanner state...');
      scanInterval = MAX_POLL_INTERVAL; // Increase interval to maximum
      consecutiveErrors = 0; // Reset error counter
      console.log('🔄 Scanner state reset - interval: 30s');
    }
    
    // Increment consecutive errors and adjust rate limiting
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      scanInterval = Math.min(scanInterval * 2, 120000); // Max 2 minutes
      console.log(`🐌 Rate limiting: ${consecutiveErrors} consecutive errors, increasing interval to ${scanInterval/1000}s`);
    }
  } finally {
    // Clear timeout and release the scan lock
    clearTimeout(scanTimeout);
    isScanning = false;
    console.log(`🔓 [${new Date().toISOString()}] Scan lock released`);
  }
}

// Schedule next scan with dynamic interval
function scheduleNextScan() {
  setTimeout(() => {
    scanFeed().then(() => {
      scheduleNextScan(); // Schedule the next scan
    }).catch((error) => {
      console.error('❌ Scan failed:', error);
      scheduleNextScan(); // Still schedule next scan even on error
    });
  }, scanInterval);
}

// Main function
async function main() {
  try {
    console.log('🚀 Sora Feed Scanner Starting...');
    console.log('📊 Database:', process.env.DB_NAME || 'sora_feed');
    
    // Initialize database
    await initDatabase();

    // Run initial scan
    await scanFeed();

    // Schedule scans with dynamic interval
    console.log(`⏰ Scheduling scans every ${scanInterval/1000} seconds...`);
    scheduleNextScan();

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down scanner...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down scanner...');
  await pool.query(`UPDATE scanner_stats SET status = 'stopped' WHERE id = 1`);
  await pool.end();
  process.exit(0);
});

// Start the scanner
main();

