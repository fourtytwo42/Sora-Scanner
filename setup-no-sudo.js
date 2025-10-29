#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  console.log('🚀 Sora Feed - Database Setup');
  console.log('==============================\n');

  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
  };

  function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  function error(message) {
    log(`❌ ${message}`, 'red');
  }

  function success(message) {
    log(`✅ ${message}`, 'green');
  }

  function info(message) {
    log(`ℹ️  ${message}`, 'blue');
  }

  function warning(message) {
    log(`⚠️  ${message}`, 'yellow');
  }

  // Test database connection
  info('Step 1: Testing database connection...');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'sora_feed',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    const client = await pool.connect();
    const version = await client.query('SELECT version()');
    success('Database connection successful!');
    log(`  ${version.rows[0].version.split(' ').slice(0, 2).join(' ')}`, 'cyan');
    client.release();
  } catch (err) {
    error(`Database connection failed: ${err.message}`);
    process.exit(1);
  }

  // Initialize database tables
  info('\nStep 2: Initializing database tables...');
  try {
    const client = await pool.connect();
    
    // Enable pg_trgm extension for fuzzy matching
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      success('pg_trgm extension enabled');
    } catch (error) {
      warning('pg_trgm extension check: ' + error.message);
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
    success('Created creators table');

    // Create posts table with normalized schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS sora_posts (
        id TEXT PRIMARY KEY,
        creator_id TEXT REFERENCES creators(id),
        text TEXT,
        posted_at BIGINT,
        updated_at BIGINT,
        permalink TEXT,
        video_url TEXT,
        video_url_md TEXT,
        thumbnail_url TEXT,
        gif_url TEXT,
        width INTEGER,
        height INTEGER,
        generation_id TEXT,
        task_id TEXT,
        like_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        remix_count INTEGER DEFAULT 0,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    success('Created sora_posts table');

    // Create scanner stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_stats (
        id SERIAL PRIMARY KEY,
        scan_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        posts_fetched INTEGER,
        new_posts INTEGER,
        duplicate_posts INTEGER,
        scan_duration_ms INTEGER,
        error_message TEXT,
        status TEXT
      );
    `);
    success('Created scanner_stats table');

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_sora_posts_creator_id ON sora_posts(creator_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sora_posts_posted_at ON sora_posts(posted_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sora_posts_indexed_at ON sora_posts(indexed_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_creators_username ON creators(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_scanner_stats_timestamp ON scanner_stats(scan_timestamp DESC)');
    success('Created database indexes');

    client.release();
    
    success('\n✨ Database setup complete!');
    log('\n📊 Database Summary:', 'cyan');
    log(`  Host: ${process.env.DB_HOST || 'localhost'}`, 'cyan');
    log(`  Port: ${process.env.DB_PORT || '5432'}`, 'cyan');
    log(`  Database: ${process.env.DB_NAME || 'sora_feed'}`, 'cyan');
    log(`  User: ${process.env.DB_USER || 'postgres'}`, 'cyan');
    log('\n🚀 Next steps:', 'green');
    log('  1. Verify your .env file has all required API credentials', 'cyan');
    log('  2. Start the scanner: npm run scanner', 'cyan');
    log('  3. Or use PM2: pm2 start ecosystem.config.js', 'cyan');
    
  } catch (err) {
    error(`Failed to initialize tables: ${err.message}`);
    error(err.stack);
    process.exit(1);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});

