#!/usr/bin/env node

const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

// Generate a secure random password
function generateRandomPassword(length = 24) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}

async function createReadOnlyUser() {
  const username = 'sora_website_readonly';
  const password = generateRandomPassword();
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'sora_feed',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    const client = await pool.connect();
    
    // Create user (escape password for SQL)
    const escapedPassword = password.replace(/'/g, "''");
    try {
      await client.query(`CREATE USER ${username} WITH PASSWORD '${escapedPassword}'`);
      console.log(`✅ User ${username} created successfully`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`⚠️  User ${username} already exists, updating password...`);
        await client.query(`ALTER USER ${username} WITH PASSWORD '${escapedPassword}'`);
      } else {
        throw err;
      }
    }
    
    const dbName = process.env.DB_NAME || 'sora_feed';
    
    // Grant privileges
    await client.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${username}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${username}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${username}`);
    await client.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${username}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${username}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ${username}`);
    await client.query(`GRANT USAGE ON SCHEMA information_schema TO ${username}`);
    await client.query(`GRANT USAGE ON SCHEMA pg_catalog TO ${username}`);
    
    // Revoke write privileges
    await client.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM ${username}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${username}`);
    
    client.release();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 READ-ONLY USER CREDENTIALS');
    console.log('='.repeat(60));
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Database: ${dbName}`);
    console.log('='.repeat(60));
    console.log('\n✅ Read-only user created and configured!');
    console.log('   This user can only SELECT data, no modifications allowed.\n');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error creating read-only user:', error.message);
    process.exit(1);
  }
}

createReadOnlyUser();

