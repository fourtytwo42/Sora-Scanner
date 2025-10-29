# JWT Token Refresh Guide

## Overview

The `refresh-token-browser.js` script automates the full OpenAI login flow (using a real Chromium instance) to grab a fresh JWT bearer token. It mirrors exactly what you do in the browser—just without the clicks—so you no longer need to dig around developer tools for tokens.

## Quick Start

### Method 1: Using Environment Variables (Recommended)

Set your credentials in `.env`:

```bash
PHONE_NUMBER=+13038675309
PASSWORD=Password
```

Then run:

```bash
npm run refresh-token
```

This launches Chromium in headless mode, completes the login, and prints the new token.

### Method 2: Direct Execution

```bash
node refresh-token-browser.js
```

Need to see what's happening? Add `--show` to open a visible browser window:

```bash
node refresh-token-browser.js --show
```

## Auto-Update .env File

To automatically update your `.env` file with the new token:

```bash
npm run refresh-token -- --update-env
```

Or directly:

```bash
node refresh-token-browser.js --update-env
```

This will:
1. ✅ Authenticate and get a new JWT token
2. ✅ Update `AUTH_BEARER_TOKEN` in your `.env` file
3. ✅ (Optional) Restart your scanner manually with the new token

## Token Information

The script will display:
- ✅ The new JWT token
- 📅 Issue date
- ⏰ Expiration date (typically 10 days from issue)
- ⏳ Token validity period

## When to Refresh

You'll need to refresh your token when:

1. **Token expires** (every ~10 days)
2. **Scanner shows auth errors** like:
   - `401 Unauthorized`
   - `403 Forbidden`
   - `Invalid or expired token`

## Automation with Cron

To automatically refresh your token before it expires, add a cron job:

```bash
# Edit crontab
crontab -e

# Add this line to refresh token every 9 days (before 10-day expiration)
0 0 */9 * * cd /home/hendo420/soraScanner && /usr/bin/node refresh-token-browser.js --update-env && pm2 restart sora-scanner
```

## Manual Token Update

If you prefer to manually update your token:

1. Run the refresh script:
   ```bash
   npm run refresh-token
   ```

2. Copy the displayed JWT token

3. Update `.env`:
   ```bash
   AUTH_BEARER_TOKEN=your_new_token_here
   ```

4. Restart the scanner:
   ```bash
   pm2 restart sora-scanner
   ```

## Troubleshooting

### "Authentication failed"

- Verify your phone number and password are correct
- Check that you can log in manually at https://auth.openai.com
- Ensure you have a stable internet connection

### "Failed to get authorization code"

- This may be due to Cloudflare protection
- Try running the script a few times
- As a fallback, you can manually extract the token from browser dev tools

### "Session token not found"

- The OAuth flow may have changed
- Check if there are any prompts or 2FA requirements on your account
- You may need to disable 2FA temporarily or use an app-specific password

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit credentials** - Keep your `.env` file in `.gitignore`
2. **Protect your JWT token** - It has full access to your OpenAI account
3. **Store securely** - Use environment variables, not hardcoded values
4. **Rotate regularly** - Don't use the same credentials everywhere
5. **Monitor access** - Check your OpenAI account for unexpected activity

## How It Works

The script follows the standard OAuth2 authorization code flow:

1. **Initiate OAuth** → Start the login flow with OpenAI
2. **Verify Password** → Authenticate with phone + password
3. **Get Authorization Code** → Receive temporary auth code
4. **Extract JWT** → Call ChatGPT's session endpoint for the bearer token

This mimics what your browser does when you log into ChatGPT manually—Puppeteer just drives the browser for you.

## Advanced Usage

### Programmatic Usage

```javascript
const { loginAndGetToken } = require('./refresh-token-browser.js');

async function refresh() {
  const token = await loginAndGetToken();
  console.log('New token:', token);
}

refresh().catch(console.error);
```

### CLI Flags

- `--update-env` → Persist the token back into `.env`
- `--show` → Open a visible browser window (default is headless)
- `--debug` → Verbose logging of each login step
- `--keep-browser` → Leave Chromium running after the script finishes (useful while debugging)

## Token Lifespan

Based on your current token:
- **Issued:** October 29, 2025
- **Expires:** November 8, 2025
- **Lifetime:** 10 days

Plan to refresh your token **every 9 days** to avoid scanner downtime.

## Support

If you encounter issues:
1. Check the scanner logs: `pm2 logs sora-scanner`
2. Verify your credentials in `.env`
3. Try the manual browser method as a backup
4. Check OpenAI's status page for service issues
