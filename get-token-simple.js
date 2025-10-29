#!/usr/bin/env node

/**
 * Simple JWT Token Getter
 * 
 * Just navigates to chatgpt.com/api/auth/session and prints the token
 * Requires you to be already logged in to chatgpt.com in this browser session
 */

const puppeteer = require('puppeteer');

async function getToken() {
  console.log('\n🚀 Getting JWT token from ChatGPT session...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/snap/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    userDataDir: '/tmp/chromium-profile'  // Persist session between runs
  });

  try {
    const page = await browser.newPage();
    
    console.log('📝 Step 1: Please log in to ChatGPT...');
    console.log('   Opening ChatGPT in browser window...');
    console.log('   👉 Log in manually if needed\n');
    
    await page.goto('https://chatgpt.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait a bit for potential redirects/auth
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if logged in
    const cookies = await page.cookies();
    const sessionToken = cookies.find(c => c.name === '__Secure-next-auth.session-token');
    
    if (!sessionToken) {
      console.log('⚠️  You are not logged in yet.');
      console.log('   Please log in to ChatGPT in the browser window that opened.');
      console.log('   Press Enter when done...');
      
      // Wait for user to press Enter
      await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }
    
    console.log('\n🎯 Step 2: Extracting JWT token...');
    
    // Go to session endpoint
    await page.goto('https://chatgpt.com/api/auth/session', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the page content
    const content = await page.content();
    
    // Try to parse as JSON
    try {
      const bodyText = await page.evaluate(() => document.body.textContent);
      const sessionData = JSON.parse(bodyText);
      
      if (sessionData && sessionData.accessToken) {
        const token = sessionData.accessToken;
        
        await browser.close();
        
        console.log('   ✓ JWT token obtained!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Your JWT token:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(token);
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Parse token info
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const exp = new Date(payload.exp * 1000);
        const iat = new Date(payload.iat * 1000);
        const now = new Date();
        const daysRemaining = Math.floor((payload.exp * 1000 - now) / (1000 * 60 * 60 * 24));
        const hoursRemaining = Math.floor((payload.exp * 1000 - now) / (1000 * 60 * 60)) % 24;
        
        console.log('📅 Token Information:');
        console.log(`   Issued at:  ${iat.toLocaleString()}`);
        console.log(`   Expires at: ${exp.toLocaleString()}`);
        console.log(`   Valid for:  ${Math.floor((payload.exp - payload.iat) / 86400)} days from issue date`);
        console.log(`   Remaining:  ${daysRemaining} days, ${hoursRemaining} hours\n`);
        
        console.log('💡 To update your .env file:');
        console.log(`   AUTH_BEARER_TOKEN=${token}\n`);
        
        return token;
      }
    } catch (e) {
      console.error('   ❌ Could not parse session data');
      console.error('   Body content:', content.substring(0, 200));
    }
    
    await browser.close();
    throw new Error('Could not extract JWT token');
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

getToken().catch(error => {
  console.error('\n❌ Failed:', error.message);
  console.error('\nMake sure you can log in to https://chatgpt.com manually\n');
  process.exit(1);
});

