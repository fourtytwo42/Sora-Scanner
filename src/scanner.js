const { Pool } = require('pg');
const https = require('https');
const http = require('http');
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

// Set timezone on database connections to Central Time
pool.on('connect', async (client) => {
  await client.query(`SET timezone = 'America/Chicago'`);
});

// Configuration
const FETCH_LIMIT = 200;
const MIN_POLL_INTERVAL = 6000;
const MAX_POLL_INTERVAL = 30000;
const BASE_POLL_INTERVAL = 10000;
const TARGET_OVERLAP_PERCENTAGE = 30;
const STATS_PORT = parseInt(process.env.STATS_PORT || '4000', 10);
const STATS_HOST = process.env.STATS_HOST || '0.0.0.0';
const DASHBOARD_CACHE_TTL = 5000;
const numberFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const decimalFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Set timezone to Central Time (America/Chicago)
process.env.TZ = 'America/Chicago';
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { 
  dateStyle: 'medium', 
  timeStyle: 'medium',
  timeZone: 'America/Chicago'
});

// State
let isScanning = false;
let scanInterval = BASE_POLL_INTERVAL;
let lastScanPostIds = new Set();
let consecutiveErrors = 0;
let scanHistory = [];
const MAX_HISTORY = 6;
let statsServer;
let dashboardCache = { timestamp: 0, data: null };
let tokenCache = null; // cache of valid tokens

// JWT helpers and storage
function parseJwtExp(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (!payload || !payload.exp) return null;
    return new Date(payload.exp * 1000);
  } catch (_) {
    return null;
  }
}

async function ensureJwtTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jwt_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      added_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`DELETE FROM jwt_tokens WHERE expires_at <= NOW()`);
}

async function listValidTokens() {
  const result = await pool.query(
    `SELECT id, token, expires_at, added_at FROM jwt_tokens WHERE expires_at > NOW() ORDER BY expires_at DESC, added_at DESC`
  );
  return result.rows;
}

async function addToken(token) {
  const exp = parseJwtExp(token);
  if (!exp) throw new Error('Invalid JWT format');
  if (exp.getTime() <= Date.now()) throw new Error('Token already expired');
  await pool.query(`INSERT INTO jwt_tokens(token, expires_at) VALUES ($1, to_timestamp($2/1000.0)) ON CONFLICT (token) DO NOTHING`, [token, exp.getTime()]);
  tokenCache = null;
}

async function removeTokenById(id) {
  await pool.query(`DELETE FROM jwt_tokens WHERE id = $1`, [id]);
  tokenCache = null;
}

async function removeTokenByToken(token) {
  await pool.query(`DELETE FROM jwt_tokens WHERE token = $1`, [token]);
  tokenCache = null;
}

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

// Low-level fetch with explicit token
async function fetchSoraFeedRaw(limit = FETCH_LIMIT, bearerToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sora.chatgpt.com',
      path: `/backend/project_y/feed?limit=${limit}&cut=nf2_latest`,
      method: 'GET',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
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
          if (res.statusCode === 401 || res.statusCode === 403) {
            const err = new Error(`HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }
          const json = JSON.parse(data);
          if (json.error) {
            const err = new Error(`API Error: ${JSON.stringify(json.error)}`);
            err.statusCode = res.statusCode || 500;
            reject(err);
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

// High-level fetch that rotates tokens and fails over
async function fetchSoraFeed(limit = FETCH_LIMIT) {
  // Load tokens from DB; if none, fall back to env
  const tokens = await listValidTokens();
  const candidates = tokens.length > 0 ? tokens.map(t => ({ id: t.id, token: t.token }))
                                       : [{ id: null, token: process.env.AUTH_BEARER_TOKEN }].filter(x => x.token);

  if (candidates.length === 0) {
    const err = new Error('No valid JWT tokens available');
    err.noTokens = true;
    throw err;
  }

  let lastError = null;
  for (const c of candidates) {
    try {
      return await fetchSoraFeedRaw(limit, c.token);
    } catch (e) {
      lastError = e;
      // If unauthorized/invalid, remove and try next
      if (e && (e.statusCode === 401 || e.statusCode === 403 || /invalid token|jwt/i.test(e.message))) {
        if (c.id) {
          await removeTokenById(c.id);
          console.warn(`🔁 Removed invalid token id=${c.id}, trying next`);
        }
        continue;
      }
      // For other errors, don't rotate token list; break
      break;
    }
  }
  throw lastError || new Error('Failed to fetch feed');
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
async function updateStats(stats, { duration, overlapPct = 0, postsPerSec = 0, pollInterval, error = null }) {
  try {
    const avgPostsPerSec = scanHistory.length > 0
      ? scanHistory.reduce((sum, h) => sum + h.postsPerSec, 0) / scanHistory.length
      : 0;
    const hadError = Boolean(error);

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
        current_poll_interval = $10,
        last_overlap_pct = $11,
        last_posts_per_second = $12,
        last_new_posts = $13,
        last_duplicates = $14,
        consecutive_errors = $15,
        last_error_at = CASE WHEN $4 > 0 THEN CURRENT_TIMESTAMP ELSE last_error_at END
      WHERE id = 1`,
      [
        stats.total || 0,
        stats.newPosts || 0,
        stats.duplicates || 0,
        hadError ? 1 : 0,
        duration,
        hadError ? 'error' : 'success',
        hadError ? error.message : null,
        stats.total || 0,
        Number(avgPostsPerSec.toFixed(2)),
        pollInterval,
        Number(overlapPct.toFixed(2)),
        Number(postsPerSec.toFixed(2)),
        stats.newPosts || 0,
        stats.duplicates || 0,
        consecutiveErrors
      ]
    );
  } catch (err) {
    console.error('Stats update failed:', err.message);
  }
}

async function recordScanHistory({
  startedAt,
  completedAt,
  duration,
  fetchCount = 0,
  newPosts = 0,
  duplicatePosts = 0,
  overlapPct = null,
  postsPerSec = null,
  pollInterval = null,
  status = 'success',
  error = null
}) {
  try {
    await pool.query(
      `INSERT INTO scanner_scan_history (
        started_at,
        completed_at,
        duration_ms,
        fetch_count,
        new_posts,
        duplicate_posts,
        overlap_pct,
        posts_per_second,
        poll_interval_ms,
        status,
        error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        startedAt,
        completedAt,
        duration,
        fetchCount,
        newPosts,
        duplicatePosts,
        overlapPct,
        postsPerSec,
        pollInterval,
        status,
        error ? error.message : null
      ]
    );
    // Bust dashboard cache so new data is rendered on next refresh
    dashboardCache.timestamp = 0;
  } catch (err) {
    console.error('History insert failed:', err.message);
  }
}

// Main scan function
async function scanFeed() {
  if (isScanning) {
    console.log(`⏸️  Scan in progress, skipping...`);
    return;
  }

  isScanning = true;
  const startedAt = new Date();
  const start = Date.now();
  let scanResult = { total: 0, newPosts: 0, duplicates: 0 };
  let overlap = 0;
  let postsPerSec = 0;
  let fetchCount = 0;
  console.log(`\n🔍 [${new Date().toISOString()}] Scanning (limit: ${FETCH_LIMIT})...`);

  try {
    await pool.query(`UPDATE scanner_stats SET status = 'scanning', current_poll_interval = $1 WHERE id = 1`, [scanInterval]);

    const feedData = await fetchSoraFeed(FETCH_LIMIT);
    fetchCount = feedData.items?.length || 0;
    console.log(`📥 Fetched ${fetchCount} posts`);

    scanResult = await processPosts(feedData);
    const duration = Date.now() - start;
    
    // Calculate metrics
    const currentIds = new Set(feedData.items?.map(i => i.post.id) || []);
    overlap = calculateOverlap(currentIds);
    postsPerSec = duration > 0 ? fetchCount / (duration / 1000) : 0;
    
    // Update history
    scanHistory.push({ postsPerSec, timestamp: Date.now() });
    if (scanHistory.length > MAX_HISTORY) scanHistory.shift();
    
    // Update for next scan
    lastScanPostIds = currentIds;

    console.log(`✅ Complete: ${scanResult.newPosts} new, ${scanResult.duplicates} dup, ${overlap.toFixed(1)}% overlap, ${postsPerSec.toFixed(1)} posts/s, ${(duration/1000).toFixed(1)}s`);

    // Adjust timing
    scanInterval = adjustPollInterval(overlap);

    await updateStats(scanResult, {
      duration,
      overlapPct: overlap,
      postsPerSec,
      pollInterval: scanInterval
    });

    await recordScanHistory({
      startedAt,
      completedAt: new Date(),
      duration,
      fetchCount,
      newPosts: scanResult.newPosts,
      duplicatePosts: scanResult.duplicates,
      overlapPct: Number(overlap.toFixed(2)),
      postsPerSec: Number(postsPerSec.toFixed(2)),
      pollInterval: scanInterval,
      status: 'success'
    });

    consecutiveErrors = 0;

  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Scan error: ${error.message}`);
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      scanInterval = Math.min(scanInterval * 2, MAX_POLL_INTERVAL);
      console.log(`🐌 Rate limiting: ${consecutiveErrors} errors, interval: ${scanInterval/1000}s`);
    }

    await updateStats(scanResult, {
      duration,
      overlapPct: 0,
      postsPerSec: 0,
      pollInterval: scanInterval,
      error
    });

    await recordScanHistory({
      startedAt,
      completedAt: new Date(),
      duration,
      fetchCount,
      newPosts: scanResult.newPosts,
      duplicatePosts: scanResult.duplicates,
      overlapPct: Number.isFinite(overlap) ? Number(overlap.toFixed(2)) : 0,
      postsPerSec: Number.isFinite(postsPerSec) ? Number(postsPerSec.toFixed(2)) : 0,
      pollInterval: scanInterval,
      status: 'error',
      error
    });
  } finally {
    isScanning = false;
  }
}

function formatNumberDisplay(value) {
  if (value === null || value === undefined) return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return numberFormatter.format(num);
}

function formatPercentDisplay(value) {
  if (value === null || value === undefined) return '0%';
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  return `${percentFormatter.format(num)}%`;
}

function formatInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${decimalFormatter.format(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${Math.round(remainingSeconds)}s`;
}

function formatSecondsDisplay(seconds) {
  const num = Number(seconds);
  if (!Number.isFinite(num) || num < 0) return '0.00 s';
  return `${decimalFormatter.format(num)} s`;
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  const secs = totalSeconds % 60;
  if (parts.length === 0 || secs > 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function statusPillClass(status) {
  switch (status) {
    case 'success':
      return 'success';
    case 'scanning':
      return 'scanning';
    case 'error':
      return 'error';
    default:
      return 'scanning';
  }
}

async function fetchDashboardData() {
  const now = Date.now();
  if (dashboardCache.data && now - dashboardCache.timestamp < DASHBOARD_CACHE_TTL) {
    return dashboardCache.data;
  }

  try {
    const [
      statsResult,
      totalsResult,
      orientationResult,
      durationResult,
      dailyResult,
      recentScansResult,
      recentTotalsResult,
      dbSizeResult
    ] = await Promise.all([
      pool.query(`
        SELECT *,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(scanner_started_at, NOW())))::BIGINT AS uptime_seconds
        FROM scanner_stats
        WHERE id = 1
      `),
      pool.query(`
        SELECT
          COUNT(*)::BIGINT AS total_posts,
          MAX(to_timestamp(posted_at)) AS latest_posted_at
        FROM sora_posts
      `),
      pool.query(`
        SELECT orientation, COUNT(*)::BIGINT AS count
        FROM sora_posts
        GROUP BY orientation
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT
          COALESCE(MIN(duration), 0)::NUMERIC(10,2) AS min_duration,
          COALESCE(MAX(duration), 0)::NUMERIC(10,2) AS max_duration,
          COALESCE(AVG(duration), 0)::NUMERIC(10,2) AS avg_duration
        FROM sora_posts
      `),
      pool.query(`
        SELECT
          to_char(to_timestamp(posted_at), 'YYYY-MM-DD') AS day,
          COUNT(*)::BIGINT AS posts
        FROM sora_posts
        WHERE to_timestamp(posted_at) >= NOW() - INTERVAL '7 days'
        GROUP BY day
        ORDER BY day DESC
      `),
      pool.query(`
        SELECT
          started_at,
          completed_at,
          duration_ms,
          fetch_count,
          new_posts,
          duplicate_posts,
          overlap_pct,
          posts_per_second,
          poll_interval_ms,
          status,
          error_message
        FROM scanner_scan_history
        ORDER BY started_at DESC
        LIMIT 15
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE to_timestamp(posted_at) >= NOW() - INTERVAL '1 hour')::BIGINT AS last_hour,
          COUNT(*) FILTER (WHERE to_timestamp(posted_at) >= NOW() - INTERVAL '24 hours')::BIGINT AS last_24h
        FROM sora_posts
      `),
      pool.query(`
        SELECT ROUND((pg_database_size(current_database())::NUMERIC / POWER(1024, 3))::NUMERIC, 2) AS size_gb
      `)
    ]);

    const stats = statsResult.rows[0] || {};
    const totals = totalsResult.rows[0] || { total_posts: 0, latest_posted_at: null };
    const orientation = orientationResult.rows || [];
    const durations = durationResult.rows[0] || { min_duration: 0, max_duration: 0, avg_duration: 0 };
    const daily = dailyResult.rows || [];
    const recentScans = recentScansResult.rows || [];
    const recentTotals = recentTotalsResult.rows[0] || { last_hour: 0, last_24h: 0 };
    const dbSize = dbSizeResult.rows[0] || { size_gb: 0 };

    // Count valid tokens from DB
    const tokensCountRes = await pool.query(`SELECT COUNT(*)::INT AS count FROM jwt_tokens WHERE expires_at > NOW()`);
    const tokensListRes = await pool.query(`SELECT id, expires_at, added_at FROM jwt_tokens ORDER BY expires_at DESC`);
    
    // Check if env token is valid and not expired
    let envTokenCount = 0;
    let envTokenInfo = null;
    if (process.env.AUTH_BEARER_TOKEN) {
      const exp = parseJwtExp(process.env.AUTH_BEARER_TOKEN);
      if (exp && exp.getTime() > Date.now()) {
        envTokenCount = 1;
        // Check if env token already exists in DB
        const envExistsRes = await pool.query(
          `SELECT id FROM jwt_tokens WHERE token = $1`,
          [process.env.AUTH_BEARER_TOKEN]
        );
        if (envExistsRes.rows.length === 0) {
          // Token not in DB, show as env token
          envTokenInfo = {
            id: 'env',
            expires_at: exp,
            added_at: new Date(),
            source: 'env'
          };
        }
      }
    }

    const data = {
      stats,
      totals,
      orientation,
      durations,
      daily,
      recentScans,
      recentTotals,
      dbSize,
      generatedAt: new Date(),
      jwt: {
        count: (tokensCountRes.rows[0]?.count || 0) + envTokenCount,
        tokens: envTokenInfo ? [envTokenInfo, ...tokensListRes.rows] : tokensListRes.rows
      }
    };

    dashboardCache = { timestamp: now, data };
    return data;
  } catch (error) {
    console.error('Dashboard data fetch failed:', error.message);
    throw error;
  }
}

function renderDashboardHTML(data) {
  const {
    stats = {},
    totals = {},
    orientation = [],
    durations = {},
    daily = [],
    recentScans = [],
    recentTotals = {},
    dbSize = { size_gb: 0 },
    jwt = { count: 0, tokens: [] },
    generatedAt = new Date()
  } = data;

  const status = stats.status || 'idle';
  const badgeClass = status === 'error' ? 'danger' : status === 'scanning' ? 'warn' : 'okay';
  const totalPosts = Number(totals.total_posts || 0);
  const lastHour = Number(recentTotals.last_hour || 0);
  const last24h = Number(recentTotals.last_24h || 0);

  // Calculate pie chart data
  const orientationMarkup = orientation.length > 0
    ? (() => {
        const items = orientation.map(item => {
          const count = Number(item.count);
          const percent = totalPosts > 0 ? (count / totalPosts) * 100 : 0;
          return { orientation: item.orientation, count, percent };
        });
        
        // Calculate SVG path for pie chart with labels
        let currentAngle = -90; // Start at top
        const radius = 100;
        const svgSize = 320;
        const center = svgSize / 2;
        const colors = {
          wide: '#38bdf8',
          tall: '#a855f7',
          square: '#10b981'
        };
        
        const svgElements = items.map(item => {
          const angle = (item.percent / 100) * 360;
          const startAngle = currentAngle;
          const midAngle = startAngle + angle / 2;
          const endAngle = currentAngle + angle;
          
          // Calculate start point
          const x1 = center + radius * Math.cos(startAngle * Math.PI / 180);
          const y1 = center + radius * Math.sin(startAngle * Math.PI / 180);
          
          // Calculate end point
          const x2 = center + radius * Math.cos(endAngle * Math.PI / 180);
          const y2 = center + radius * Math.sin(endAngle * Math.PI / 180);
          
          const largeArcFlag = angle > 180 ? 1 : 0;
          
          // Decide if label should be inside or outside based on angle size
          // Large slices (>10%) get inside labels, smaller ones get outside
          const useInsideLabel = angle > 36; // 10% of 360 degrees
          
          // Calculate label position
          const labelRadius = useInsideLabel ? radius * 0.6 : radius + 40;
          const labelX = center + labelRadius * Math.cos(midAngle * Math.PI / 180);
          const labelY = center + labelRadius * Math.sin(midAngle * Math.PI / 180);
          
          // Calculate line start point (on the edge of the slice, only for outside labels)
          const lineStartX = useInsideLabel ? 0 : center + (radius + 10) * Math.cos(midAngle * Math.PI / 180);
          const lineStartY = useInsideLabel ? 0 : center + (radius + 10) * Math.sin(midAngle * Math.PI / 180);
          
          currentAngle += angle;
          
          return {
            path: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`,
            color: colors[item.orientation] || '#64748b',
            label: item.orientation,
            count: item.count,
            percent: item.percent,
            labelX,
            labelY,
            lineStartX,
            lineStartY,
            useInsideLabel
          };
        });
        
        return `
          <div style="display:flex;justify-content:center;align-items:center;">
            <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
              ${svgElements.map(e => `<path d="${e.path}" fill="${e.color}" stroke="rgba(15,23,42,0.8)" stroke-width="2" style="cursor:pointer;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"/>`).join('')}
              ${svgElements.map(e => `
                <g>
                  ${e.useInsideLabel ? '' : `<line x1="${e.lineStartX}" 
                        y1="${e.lineStartY}" 
                        x2="${e.labelX}" 
                        y2="${e.labelY}" 
                        stroke="${e.color}" 
                        stroke-width="2" 
                        opacity="0.6"/>`}
                  <text x="${e.labelX}" 
                        y="${e.labelY - 15}" 
                        text-anchor="middle" 
                        fill="${e.useInsideLabel ? '#f1f5f9' : e.color}" 
                        font-size="14" 
                        font-weight="600" 
                        text-transform="capitalize">
                    ${e.label}
                  </text>
                  <text x="${e.labelX}" 
                        y="${e.labelY}" 
                        text-anchor="middle" 
                        fill="${e.useInsideLabel ? '#f1f5f9' : '#f1f5f9'}" 
                        font-size="12">
                    ${formatNumberDisplay(e.count)}
                  </text>
                  <text x="${e.labelX}" 
                        y="${e.labelY + 15}" 
                        text-anchor="middle" 
                        fill="${e.useInsideLabel ? 'rgba(226,232,240,0.85)' : 'rgba(226,232,240,0.75)'}" 
                        font-size="11">
                    ${formatPercentDisplay(e.percent)}
                  </text>
                </g>
              `).join('')}
            </svg>
          </div>
        `;
      })()
    : '<p class="muted">No orientation data yet.</p>';

  const dailyMarkup = daily.length > 0
    ? `<div class="daily-grid">
        ${daily.map(item => `
          <div class="daily-card">
            <div class="day">${item.day}</div>
            <div class="count">${formatNumberDisplay(item.posts)}</div>
          </div>
        `).join('')}
      </div>`
    : '<p class="muted">Waiting for enough data to build the 7 day trend.</p>';

  const recentRows = recentScans.length > 0
    ? recentScans.map(scan => `
        <tr>
          <td>${formatTimestamp(scan.started_at)}</td>
          <td>${formatInterval(scan.duration_ms)}</td>
          <td>${formatNumberDisplay(scan.fetch_count)}</td>
          <td>${formatNumberDisplay(scan.new_posts)}</td>
          <td>${formatNumberDisplay(scan.duplicate_posts)}</td>
          <td>${formatPercentDisplay(scan.overlap_pct || 0)}</td>
          <td>${decimalFormatter.format(Number(scan.posts_per_second || 0))} /s</td>
          <td>${formatInterval(scan.poll_interval_ms)}</td>
          <td>
            <span class="status-pill ${statusPillClass(scan.status)}">
              ${scan.status}
            </span>
          </td>
          <td class="muted">${scan.error_message ? scan.error_message : ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="10" class="muted">No scans recorded yet.</td></tr>`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="30">
      <title>Sora Scanner Dashboard</title>
      <style>
        :root { color-scheme: dark; font-family: 'Inter', system-ui, sans-serif; }
        body {
          margin: 0;
          background: radial-gradient(circle at top, #0b1220, #05070c 55%);
          color: #f1f5f9;
          min-height: 100vh;
          padding: 2.5rem 1.5rem 3rem;
        }
        main { max-width: 1180px; margin: 0 auto; }
        header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1rem; justify-content: space-between; margin-bottom: 2rem; }
        h1 { margin: 0; font-size: 2rem; letter-spacing: -0.01em; }
        .subtitle { color: rgba(255,255,255,0.55); font-size: 0.95rem; }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 999px;
          padding: 0.45rem 0.9rem;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 600;
        }
        .badge.okay { background: rgba(40,167,69,0.15); color: #8dffbd; }
        .badge.warn { background: rgba(255,193,7,0.15); color: #ffe08a; }
        .badge.danger { background: rgba(220,53,69,0.18); color: #ff9aa8; }
        .grid {
          display: grid;
          gap: 1.2rem;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          margin-bottom: 2rem;
        }
        .card {
          background: rgba(15,23,42,0.82);
          border: 1px solid rgba(148,163,184,0.12);
          border-radius: 18px;
          padding: 1.4rem;
          backdrop-filter: blur(20px);
          box-shadow: 0 12px 40px -24px rgba(15,23,42,0.9);
        }
        .card h2 {
          margin: 0 0 0.9rem;
          font-size: 1rem;
          color: rgba(226,232,240,0.9);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .metric { font-size: 2rem; font-weight: 600; margin-bottom: 0.25rem; }
        .hint { color: rgba(226,232,240,0.65); font-size: 0.85rem; }
        .section { margin-bottom: 2.5rem; }
        .section-title {
          margin: 0 0 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(226,232,240,0.7);
        }
        .subgrid {
          display: grid;
          gap: 1.2rem;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .orientation-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 0.8rem;
        }
        .orientation-row .label { text-transform: capitalize; font-weight: 500; color: rgba(226,232,240,0.8); }
        .orientation-row .bar {
          position: relative;
          height: 9px;
          background: rgba(148,163,184,0.18);
          border-radius: 999px;
          overflow: hidden;
        }
        .orientation-row .fill {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #38bdf8, #a855f7);
        }
        .orientation-row .value { font-variant-numeric: tabular-nums; color: rgba(226,232,240,0.75); font-size: 0.85rem; }
        .table-wrapper { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(148,163,184,0.14); margin-top: 1rem; }
        table { width: 100%; border-collapse: collapse; min-width: 720px; }
        th, td { padding: 0.75rem 1rem; text-align: left; font-variant-numeric: tabular-nums; }
        th {
          background: rgba(15,23,42,0.6);
          color: rgba(148,163,184,0.7);
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        td { border-top: 1px solid rgba(148,163,184,0.08); color: rgba(226,232,240,0.92); }
        tr:hover td { background: rgba(59,130,246,0.08); }
        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .status-pill.success { background: rgba(34,197,94,0.15); color: #bbf7d0; }
        .status-pill.error { background: rgba(239,68,68,0.15); color: #fecaca; }
        .status-pill.scanning { background: rgba(59,130,246,0.18); color: #bfdbfe; }
        .muted { color: rgba(148,163,184,0.65); }
        .daily-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
        .daily-card {
          background: rgba(15,23,42,0.68);
          border-radius: 12px;
          padding: 0.85rem;
          border: 1px solid rgba(148,163,184,0.1);
        }
        .daily-card .day { font-size: 0.85rem; color: rgba(226,232,240,0.75); }
        .daily-card .count { font-size: 1.3rem; font-weight: 600; }
        footer { margin-top: 2rem; text-align: center; color: rgba(148,163,184,0.6); font-size: 0.8rem; }
        @media (max-width: 720px) {
          header { flex-direction: column; align-items: flex-start; }
          body { padding: 1.5rem 1rem 2rem; }
          .grid { grid-template-columns: 1fr; }
          div[style*="display:grid"][style*="grid-template-columns:auto 1fr"] {
            grid-template-columns: 1fr !important;
            justify-items: center;
          }
        }
      </style>
    </head>
    <body>
      <main>
        <header>
          <div>
            <h1>Sora Scanner Dashboard</h1>
            <div class="subtitle">Database health &amp; ingestion performance</div>
          </div>
          <div class="badge ${badgeClass}">
            ${status}
          </div>
        </header>

        ${jwt.count === 0 ? `<div style="background:#5a0000;border:1px solid #ff6b6b;color:#ffdede;padding:12px 16px;border-radius:10px;margin:0 0 16px;">
          <strong>No valid JWT tokens.</strong> Add a token below to resume scanning.
        </div>` : jwt.count > 0 ? `<div style="background:rgba(40,167,69,0.15);border:1px solid rgba(40,167,69,0.4);color:#8dffbd;padding:12px 16px;border-radius:10px;margin:0 0 16px;">
          <strong>✅ ${jwt.count} valid JWT token${jwt.count > 1 ? 's' : ''} active.</strong> ${jwt.count > 1 ? 'Scanner is using the best available token.' : 'Scanner is using this token.'}
        </div>` : ''}

        <section class="grid">
          <div class="card">
            <h2>Total Posts Indexed</h2>
            <div class="metric">${formatNumberDisplay(totalPosts)}</div>
            <div class="hint">+${formatNumberDisplay(last24h)} in the last 24h • +${formatNumberDisplay(lastHour)} in the past hour</div>
          </div>
          <div class="card">
            <h2>Average Throughput</h2>
            <div class="metric">${decimalFormatter.format(Number(stats.avg_posts_per_second || 0))} /s</div>
            <div class="hint">Last scan: ${decimalFormatter.format(Number(stats.last_posts_per_second || 0))} /s (${formatPercentDisplay(stats.last_overlap_pct || 0)} overlap)</div>
          </div>
          <div class="card">
            <h2>Polling Interval</h2>
            <div class="metric">${formatInterval(stats.current_poll_interval)}</div>
            <div class="hint">Target overlap ${TARGET_OVERLAP_PERCENTAGE}% • Consecutive errors: ${formatNumberDisplay(stats.consecutive_errors || 0)}</div>
          </div>
          <div class="card">
            <h2>Uptime &amp; Last Scan</h2>
            <div class="metric">${formatUptime(Number(stats.uptime_seconds || 0))}</div>
            <div class="hint">Last scan: ${formatTimestamp(stats.last_scan_at)}</div>
          </div>
          <div class="card">
            <h2>Database Size</h2>
            <div class="metric">${decimalFormatter.format(Number(dbSize.size_gb || 0))} GB</div>
            <div class="hint">Total database size including indexes</div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Scanner Health</h2>
          <div class="subgrid">
            <div class="card">
              <h2>Latest Activity</h2>
              <div class="hint">New posts: ${formatNumberDisplay(stats.last_new_posts || 0)}</div>
              <div class="hint">Duplicates: ${formatNumberDisplay(stats.last_duplicates || 0)}</div>
              <div class="hint">Total scanned this pass: ${formatNumberDisplay(stats.last_scan_count || 0)}</div>
            </div>
            <div class="card">
              <h2>Error Tracking</h2>
              <div class="hint">Total errors: ${formatNumberDisplay(stats.errors || 0)}</div>
              <div class="hint">Last error: ${formatTimestamp(stats.last_error_at)}</div>
              <div class="hint">${stats.error_message ? `Last message: ${stats.error_message}` : 'No recent errors 🎉'}</div>
            </div>
            <div class="card">
              <h2>Video Duration (s)</h2>
              <div class="hint">Avg: ${formatSecondsDisplay(durations.avg_duration || 0)}</div>
              <div class="hint">Min: ${formatSecondsDisplay(durations.min_duration || 0)} • Max: ${formatSecondsDisplay(durations.max_duration || 0)}</div>
              <div class="hint">Latest post: ${formatTimestamp(totals.latest_posted_at)}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Orientation Distribution</h2>
          <div class="card">
            ${orientationMarkup}
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Activity (Last 7 Days)</h2>
          <div class="card">
            ${dailyMarkup}
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Recent Scans</h2>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Fetched</th>
                  <th>New</th>
                  <th>Duplicates</th>
                  <th>Overlap</th>
                  <th>Speed</th>
                  <th>Next Poll</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                ${recentRows}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">JWT Tokens</h2>
          <div class="card">
            <form id="addTokenForm" onsubmit="return addToken(event)" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input id="tokenInput" type="text" placeholder="Paste JWT token here" style="flex:1;min-width:320px;padding:10px;border-radius:8px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.6);color:#fff" />
              <button type="submit" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(148,163,184,0.3);background:rgba(59,130,246,0.25);color:#dbeafe;cursor:pointer;">Add Token</button>
            </form>
            <div id="tokenMsg" class="hint" style="margin-top:8px;"></div>
            <div class="table-wrapper" style="margin-top:12px;">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Expires</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="tokensBody">
                  ${jwt.tokens.length > 0 ? jwt.tokens.map(t => `
                    <tr ${t.source === 'env' ? 'style="background:rgba(59,130,246,0.08);"' : ''}>
                      <td>${t.id === 'env' ? '<span style="color:#38bdf8;font-weight:600;">ENV</span>' : t.id}</td>
                      <td>${formatTimestamp(t.expires_at)}</td>
                      <td>${t.source === 'env' ? '<span class="muted">Environment Variable</span>' : formatTimestamp(t.added_at)}</td>
                      <td>
                        ${t.source === 'env' ? '<span style="padding:6px 10px;border-radius:8px;background:rgba(59,130,246,0.25);color:#93c5fd;font-size:0.85rem;">Active</span>' : `<button onclick="deleteToken(${t.id})" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(148,163,184,0.3);background:rgba(239,68,68,0.25);color:#fecaca;cursor:pointer;">Remove</button>`}
                      </td>
                    </tr>
                  `).join('') : `<tr><td colspan="4" class="muted">No tokens yet.</td></tr>`}
                </tbody>
              </table>
            </div>
            <script>
              async function addToken(e){
                e.preventDefault();
                const input = document.getElementById('tokenInput');
                const msg = document.getElementById('tokenMsg');
                msg.textContent = 'Validating and adding...';
                try{
                  const res = await fetch('/api/tokens', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: input.value.trim() }) });
                  const j = await res.json();
                  if(!res.ok || !j.success){ throw new Error(j.error || 'Failed'); }
                  location.reload();
                }catch(err){ msg.textContent = 'Error: ' + err.message; }
              }
              async function deleteToken(id){
                const ok = confirm('Remove this token?');
                if(!ok) return;
                const res = await fetch('/api/tokens/' + id, { method:'DELETE' });
                const j = await res.json();
                if(!res.ok || !j.success){ alert(j.error || 'Failed'); return; }
                location.reload();
              }
            </script>
          </div>
        </section>

        <footer>
          Updated ${formatTimestamp(generatedAt)} • Auto refresh every 30s • API limit ${FETCH_LIMIT} posts/scan
        </footer>
      </main>
    </body>
  </html>`;
}

function startStatsServer() {
  const server = http.createServer(async (req, res) => {
    const hostHeader = req.headers.host || `${STATS_HOST}:${STATS_PORT}`;
    const requestUrl = new URL(req.url, `http://${hostHeader}`);

    try {
      if (requestUrl.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      if (requestUrl.pathname === '/api/stats') {
        const data = await fetchDashboardData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      // JWT management API
      if (requestUrl.pathname === '/api/tokens' && req.method === 'GET') {
        const tokens = await listValidTokens();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tokens }));
        return;
      }
      if (requestUrl.pathname === '/api/tokens' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const token = (data.token || '').trim();
            if (!token) throw new Error('Missing token');
            await addToken(token);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }
      if (requestUrl.pathname.startsWith('/api/tokens/') && req.method === 'DELETE') {
        const id = parseInt(requestUrl.pathname.split('/').pop(), 10);
        if (!Number.isFinite(id)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid id' }));
          return;
        }
        await removeTokenById(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
        const data = await fetchDashboardData();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDashboardHTML(data));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (error) {
      console.error('Stats endpoint error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  server.listen(STATS_PORT, STATS_HOST, () => {
    console.log(`📈 Stats dashboard available at http://${STATS_HOST}:${STATS_PORT}`);
  });

  server.on('error', (err) => {
    console.error('Stats server error:', err.message);
  });

  return server;
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

    await ensureJwtTable();

    await pool.query(
      `UPDATE scanner_stats
       SET scanner_started_at = NOW(),
           status = 'starting',
           error_message = NULL,
           current_poll_interval = $1
       WHERE id = 1`,
      [scanInterval]
    );

    statsServer = startStatsServer();

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
  if (statsServer) {
    await new Promise(resolve => statsServer.close(resolve));
  }
  await pool.query(`UPDATE scanner_stats SET status = 'stopped', current_poll_interval = $1 WHERE id = 1`, [scanInterval]);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  if (statsServer) {
    await new Promise(resolve => statsServer.close(resolve));
  }
  await pool.query(`UPDATE scanner_stats SET status = 'stopped', current_poll_interval = $1 WHERE id = 1`, [scanInterval]);
  await pool.end();
  process.exit(0);
});

// Start
main();
