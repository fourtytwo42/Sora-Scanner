#!/usr/bin/env node
'use strict';

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/env-status', (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const envVars = {
      'PHONE_NUMBER': envContent.includes('PHONE_NUMBER='),
      'PASSWORD': envContent.includes('PASSWORD='),
      'AUTH_BEARER_TOKEN': envContent.includes('AUTH_BEARER_TOKEN='),
      'USER_AGENT': envContent.includes('USER_AGENT='),
      'ACCEPT_LANGUAGE': envContent.includes('ACCEPT_LANGUAGE='),
      'DB_HOST': envContent.includes('DB_HOST='),
      'DB_PASSWORD': envContent.includes('DB_PASSWORD=')
    };
    
    res.json(envVars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/current-token', (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const tokenMatch = envContent.match(/AUTH_BEARER_TOKEN=(.+)/);
    const token = tokenMatch ? tokenMatch[1].trim() : null;
    
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/refresh-token', (req, res) => {
  const command = 'bash -lc "cd /home/hendo420/soraScanner && . ~/.nvm/nvm.sh && timeout 300 xvfb-run -a npm run refresh-token -- --headless 2>&1"';

  exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    const logs = (stdout || '') + (stderr || '');

    // Try to extract token from logs
    let token = null;
    const prefixed = logs.match(/AUTH_BEARER_TOKEN=([^\s]+)/);
    if (prefixed && prefixed[1]) {
      token = prefixed[1];
    } else {
      const jwtLike = logs.match(/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+)/);
      if (jwtLike && jwtLike[1]) {
        // Validate payload parses as JSON
        try {
          const parts = jwtLike[1].split('.');
          if (parts.length === 3) {
            JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            token = jwtLike[1];
          }
        } catch (_) { /* ignore */ }
      }
    }

    if (token) {
      res.json({ success: true, token, logs: logs });
    } else {
      res.json({ success: false, error: 'No token found in output', logs: logs });
    }
  });
});

app.post('/api/manual-login', (req, res) => {
  const command = 'bash -lc "cd /home/hendo420/soraScanner && . ~/.nvm/nvm.sh && timeout 600 xvfb-run -a node get-token-simple.js --headless 2>&1"';

  exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    const logs = (stdout || '') + (stderr || '');

    // Try to extract token from logs
    let token = null;
    const prefixed = logs.match(/AUTH_BEARER_TOKEN=([^\s]+)/);
    if (prefixed && prefixed[1]) {
      token = prefixed[1];
    } else {
      const jwtLike = logs.match(/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+)/);
      if (jwtLike && jwtLike[1]) {
        try {
          const parts = jwtLike[1].split('.');
          if (parts.length === 3) {
            JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            token = jwtLike[1];
          }
        } catch (_) { /* ignore */ }
      }
    }

    if (token) {
      res.json({ success: true, token, logs: logs });
    } else {
      res.json({ success: false, error: 'No token found in output', logs: logs });
    }
  });
});

app.post('/api/test-token', (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const tokenMatch = envContent.match(/AUTH_BEARER_TOKEN=(.+)/);
    const token = tokenMatch ? tokenMatch[1].trim() : null;
    
    if (!token) {
      return res.json({ valid: false, error: 'No token found in .env file' });
    }
    
    // Parse JWT token
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      
      const now = Math.floor(Date.now() / 1000);
      const expires = new Date(decoded.exp * 1000);
      
      if (decoded.exp < now) {
        res.json({ valid: false, error: 'Token has expired' });
      } else {
        res.json({ 
          valid: true, 
          expires: expires.toLocaleString(),
          issued: new Date(decoded.iat * 1000).toLocaleString()
        });
      }
    } catch (jwtError) {
      res.json({ valid: false, error: 'Invalid JWT format' });
    }
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

app.post('/api/update-env', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    // Update or add AUTH_BEARER_TOKEN
    if (envContent.includes('AUTH_BEARER_TOKEN=')) {
      envContent = envContent.replace(/AUTH_BEARER_TOKEN=.*/g, `AUTH_BEARER_TOKEN=${token}`);
    } else {
      envContent += `\nAUTH_BEARER_TOKEN=${token}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/scanner-status', (req, res) => {
  exec('pm2 status sora-scanner', (error, stdout, stderr) => {
    const isRunning = stdout.includes('online');
    
    // Try to get database stats
    exec('bash -lc "cd /home/hendo420/soraScanner && . ~/.nvm/nvm.sh && echo \"Country1!\" | sudo -S -u postgres psql -d sora_feed -t -c \"SELECT COUNT(*) FROM sora_posts;\""', (dbError, dbStdout, dbStderr) => {
      const posts = dbError ? 'Unknown' : dbStdout.trim();
      
      res.json({
        running: isRunning,
        status: isRunning ? 'online' : 'offline',
        posts: posts
      });
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Token refresh server running on http://localhost:${PORT}`);
  console.log(`📱 Open this URL in your browser to access the interface`);
});