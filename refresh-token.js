#!/usr/bin/env node

/**
 * OpenAI JWT Token Refresh Script
 * 
 * This script automates the login flow to retrieve a fresh JWT token.
 * It handles the OAuth2 flow, including password verification and consent.
 * 
 * Usage: node refresh-token.js
 */

const https = require('https');
const { URLSearchParams } = require('url');

// Configuration - Load from environment or prompt
const PHONE_NUMBER = process.env.PHONE_NUMBER || '+12178482206';
const PASSWORD = process.env.PASSWORD || 'Colorado2272014!';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// OAuth2 Configuration
const CLIENT_ID = 'app_X8zY6vW2pQ9tR3dE7nK1jL5gH';
const REDIRECT_URI = 'https://chatgpt.com/api/auth/callback/openai';
const SCOPE = 'openid email profile offline_access model.request model.read organization.read organization.write';
const AUDIENCE = 'https://api.openai.com/v1';

class OpenAIAuth {
  constructor() {
    this.cookies = {};
    this.deviceId = this.generateDeviceId();
  }

  generateDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  parseCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    
    headers.forEach(header => {
      const parts = header.split(';')[0].split('=');
      const name = parts[0];
      const value = parts.slice(1).join('=');
      if (value && value !== 'null') {
        this.cookies[name] = value;
      }
    });
  }

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  async makeRequest(options) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        this.parseCookies(res.headers['set-cookie']);
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            location: res.headers.location
          });
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  async initiateAuth() {
    console.log('🔐 Step 1: Initiating OAuth2 flow...');
    
    const state = this.generateDeviceId();
    const authSessionLoggingId = this.generateDeviceId();
    
    const params = new URLSearchParams({
      audience: AUDIENCE,
      auth_session_logging_id: authSessionLoggingId,
      client_id: CLIENT_ID,
      device_id: this.deviceId,
      'ext-oai-did': this.deviceId,
      login_hint: PHONE_NUMBER,
      prompt: 'login',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      screen_hint: 'login_or_signup',
      state: state
    });

    const options = {
      hostname: 'auth.openai.com',
      path: `/api/oauth/oauth2/auth?${params.toString()}`,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': this.getCookieString()
      }
    };

    const response = await this.makeRequest(options);
    
    // Follow redirects to login page
    if (response.statusCode === 302 || response.statusCode === 303) {
      console.log('   → Redirected to login page');
      return { state, authSessionLoggingId };
    }
    
    throw new Error('Failed to initiate auth flow');
  }

  async verifyPassword(authSessionLoggingId) {
    console.log('🔑 Step 2: Verifying password...');
    
    const body = JSON.stringify({
      username: PHONE_NUMBER,
      password: PASSWORD
    });

    const options = {
      hostname: 'auth.openai.com',
      path: '/api/accounts/password/verify',
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': this.getCookieString(),
        'Origin': 'https://auth.openai.com',
        'Referer': 'https://auth.openai.com/log-in/password'
      },
      body: body
    };

    const response = await this.makeRequest(options);
    
    if (response.statusCode === 200) {
      console.log('   ✓ Password verified');
      return true;
    }
    
    throw new Error('Password verification failed');
  }

  async getAuthorizationCode(state, authSessionLoggingId) {
    console.log('🎫 Step 3: Getting authorization code...');
    
    const params = new URLSearchParams({
      audience: AUDIENCE,
      auth_session_logging_id: authSessionLoggingId,
      client_id: CLIENT_ID,
      device_id: this.deviceId,
      'ext-oai-did': this.deviceId,
      login_hint: PHONE_NUMBER,
      prompt: 'login',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      screen_hint: 'login_or_signup',
      state: state
    });

    const options = {
      hostname: 'auth.openai.com',
      path: `/api/oauth/oauth2/auth?${params.toString()}`,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': this.getCookieString(),
        'Referer': 'https://auth.openai.com/log-in/password'
      }
    };

    let response = await this.makeRequest(options);
    let redirectCount = 0;
    const maxRedirects = 5;

    // Follow redirect chain
    while ((response.statusCode === 302 || response.statusCode === 303) && redirectCount < maxRedirects) {
      const location = response.location;
      
      if (location.startsWith('https://chatgpt.com/api/auth/callback/openai?code=')) {
        // Extract the authorization code
        const url = new URL(location);
        const code = url.searchParams.get('code');
        console.log('   ✓ Authorization code obtained');
        return code;
      }
      
      // Follow the redirect
      const url = new URL(location, 'https://auth.openai.com');
      options.hostname = url.hostname;
      options.path = url.pathname + url.search;
      
      response = await this.makeRequest(options);
      redirectCount++;
    }
    
    throw new Error('Failed to get authorization code');
  }

  async exchangeCodeForToken(code) {
    console.log('🎟️  Step 4: Exchanging code for access token...');
    
    // This part is tricky - we need to simulate what ChatGPT does
    // The actual token exchange happens on chatgpt.com's backend
    // We need to follow the callback and extract the session token
    
    const options = {
      hostname: 'chatgpt.com',
      path: `/api/auth/callback/openai?code=${code}&scope=${encodeURIComponent(SCOPE)}&state=dummy`,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cookie': this.getCookieString(),
        'Referer': 'https://auth.openai.com/'
      }
    };

    const response = await this.makeRequest(options);
    
    // Extract session token from Set-Cookie headers
    const sessionToken = this.cookies['__Secure-next-auth.session-token'];
    
    if (sessionToken) {
      console.log('   ✓ Session token obtained');
      return sessionToken;
    }
    
    throw new Error('Failed to get session token');
  }

  async getAccessToken(sessionToken) {
    console.log('🎯 Step 5: Getting access token (JWT)...');
    
    const options = {
      hostname: 'chatgpt.com',
      path: '/api/auth/session',
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Cookie': `__Secure-next-auth.session-token=${sessionToken}`
      }
    };

    const response = await this.makeRequest(options);
    
    if (response.statusCode === 200) {
      const session = JSON.parse(response.data);
      const accessToken = session.accessToken;
      
      if (accessToken) {
        console.log('   ✓ Access token (JWT) obtained!');
        return accessToken;
      }
    }
    
    throw new Error('Failed to get access token');
  }

  async login() {
    try {
      console.log('\n🚀 Starting OpenAI authentication...\n');
      
      // Step 1: Initiate OAuth flow
      const { state, authSessionLoggingId } = await this.initiateAuth();
      
      // Step 2: Verify password
      await this.verifyPassword(authSessionLoggingId);
      
      // Step 3: Get authorization code
      const code = await this.getAuthorizationCode(state, authSessionLoggingId);
      
      // Step 4: Exchange code for session token
      const sessionToken = await this.exchangeCodeForToken(code);
      
      // Step 5: Get access token (JWT)
      const accessToken = await this.getAccessToken(sessionToken);
      
      console.log('\n✅ Authentication successful!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Your new JWT token:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(accessToken);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Parse and show expiration
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
      const exp = new Date(payload.exp * 1000);
      const iat = new Date(payload.iat * 1000);
      
      console.log('📅 Token Information:');
      console.log(`   Issued at:  ${iat.toLocaleString()}`);
      console.log(`   Expires at: ${exp.toLocaleString()}`);
      console.log(`   Valid for:  ${Math.floor((payload.exp - payload.iat) / 86400)} days\n`);
      
      // Optionally update .env file
      if (process.argv.includes('--update-env')) {
        await this.updateEnvFile(accessToken);
      } else {
        console.log('💡 Tip: Run with --update-env to automatically update your .env file\n');
      }
      
      return accessToken;
      
    } catch (error) {
      console.error('\n❌ Authentication failed:', error.message);
      console.error('\nPlease check your credentials and try again.\n');
      process.exit(1);
    }
  }

  async updateEnvFile(accessToken) {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '.env');
    
    try {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update AUTH_BEARER_TOKEN
      if (envContent.includes('AUTH_BEARER_TOKEN=')) {
        envContent = envContent.replace(
          /AUTH_BEARER_TOKEN=.*/,
          `AUTH_BEARER_TOKEN=${accessToken}`
        );
      } else {
        envContent += `\nAUTH_BEARER_TOKEN=${accessToken}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Updated .env file with new token\n');
      
    } catch (error) {
      console.error('⚠️  Warning: Could not update .env file:', error.message);
    }
  }
}

// Main execution
if (require.main === module) {
  const auth = new OpenAIAuth();
  auth.login();
}

module.exports = OpenAIAuth;

