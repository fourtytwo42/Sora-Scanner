# Test Your Token Refresh Script

## Quick Test

The issue was **Cloudflare blocking automated requests**. The new script uses a real Chrome browser to bypass this.

### Test It Now

```bash
# Run with visible browser to watch it work
npm run refresh-token
```

You'll see a Chrome window open and automate the login process!

### What You'll See

1. Chrome opens
2. Goes to chatgpt.com
3. Clicks "Log in"
4. Enters your phone: `+12178482206`
5. Enters your password
6. Waits for authentication
7. Extracts the JWT token
8. Displays it in terminal
9. Browser closes

### Expected Output

```
🚀 Starting OpenAI authentication...

🌐 Step 1: Opening ChatGPT login page...
🔐 Step 2: Clicking login button...
📱 Step 3: Entering phone number...
🔑 Step 4: Entering password...
⏳ Step 5: Waiting for authentication to complete...
🎯 Step 6: Extracting JWT token...
   ✓ JWT token obtained!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your new JWT token:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MzQ0ZTY1LWJiYzktNDRkMS1hOWQwLWY5...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Token Information:
   Issued at:  10/29/2025, 12:00:00 AM
   Expires at: 11/8/2025, 12:00:00 AM
   Valid for:  10 days from issue date
   Remaining:  10 days, 0 hours
```

## Troubleshooting

### "Error: Cannot open display"

If you're on a server without a display (SSH):

```bash
# Use headless mode
npm run refresh-token -- --headless
```

Or run with virtual display:

```bash
# Install xvfb
sudo apt-get install -y xvfb

# Run with virtual display
xvfb-run -a npm run refresh-token
```

### "Navigation timeout"

The page took too long to load. Try again:

```bash
# Usually works on second try
npm run refresh-token
```

### "Could not extract JWT token"

You may need to log in manually once:

1. Open browser and go to https://chatgpt.com
2. Log in manually
3. Then run the script again

### Wrong Credentials

Update your `.env` file:

```bash
PHONE_NUMBER=+12178482206
PASSWORD=your_actual_password
```

## Once It Works

### Auto-update .env

```bash
# This will update your .env file automatically
npm run refresh-token -- --update-env
```

### Restart Scanner

```bash
pm2 restart sora-scanner
```

### Verify It's Working

```bash
pm2 logs sora-scanner
```

You should see new scans happening!

## Automate It

Once you confirm it works, set up a cron job:

```bash
# Edit crontab
crontab -e

# Add this line (runs every 9 days)
0 0 */9 * * cd /home/hendo420/soraScanner && xvfb-run -a node refresh-token-browser.js --headless --update-env && pm2 restart sora-scanner >> /home/hendo420/soraScanner/logs/token-refresh.log 2>&1
```

This will:
- ✅ Run every 9 days (before 10-day expiration)
- ✅ Use headless mode
- ✅ Auto-update .env
- ✅ Restart scanner
- ✅ Log everything

## Debug Mode

If something goes wrong, run without headless to watch:

```bash
# See exactly what the browser is doing
node refresh-token-browser.js

# Or with env update
node refresh-token-browser.js --update-env
```

## Success Checklist

- [ ] Script opens Chrome window
- [ ] Navigates to chatgpt.com
- [ ] Enters phone number
- [ ] Enters password
- [ ] Gets JWT token
- [ ] Displays token in terminal
- [ ] (Optional) Updates .env file

Once all checked, you're good to go! 🎉

## Manual Fallback

If the script fails, you can always get the token manually:

1. Open browser and log into chatgpt.com
2. Open DevTools (F12)
3. Go to: https://chatgpt.com/api/auth/session
4. Find `accessToken` in the JSON response
5. Copy that value
6. Update .env manually

But the script should work! 💪

