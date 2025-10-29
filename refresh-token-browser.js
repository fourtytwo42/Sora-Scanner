#!/usr/bin/env node
'use strict';

/**
 * Automated JWT token retrieval for ChatGPT / Sora scanner.
 *
 * This script launches Chromium via Puppeteer, performs the full OpenAI OAuth
 * login flow using the credentials stored in .env, extracts the resulting JWT
 * bearer token, and (optionally) writes it back to the .env file.
 *
 * Headless mode is enabled by default so it can run unattended (for cron).
 * Pass --show to open a visible browser window for debugging.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT_DIR = __dirname;
const ENV_PATH = path.join(ROOT_DIR, '.env');

if (fs.existsSync(ENV_PATH)) {
  // Load local .env values when running via npm script.
  require('dotenv').config({ path: ENV_PATH });
} else {
  require('dotenv').config();
}

const PHONE_NUMBER = (process.env.PHONE_NUMBER || '').trim();
const PASSWORD = (process.env.PASSWORD || '').trim();

if (!PHONE_NUMBER || !PASSWORD) {
  console.error('❌ PHONE_NUMBER and/or PASSWORD missing from environment (.env).');
  process.exit(1);
}

const ARG_SET = new Set(process.argv.slice(2));
const SHOULD_UPDATE_ENV = ARG_SET.has('--update-env');
const SHOW_BROWSER = ARG_SET.has('--show') || ARG_SET.has('--no-headless');
const FORCE_HEADLESS = ARG_SET.has('--headless');
const DEBUG_LOG = ARG_SET.has('--debug') || true; // Enable debug by default

const HEADLESS_MODE = SHOW_BROWSER ? false : (FORCE_HEADLESS ? 'new' : 'new');
const LOGIN_TIMEOUT = 120_000;
const NAVIGATION_TIMEOUT = 90_000;
const SESSION_TIMEOUT = 30_000;

const CLIENT_ID = 'app_X8zY6vW2pQ9tR3dE7nK1jL5gH';
const REDIRECT_URI = 'https://chatgpt.com/api/auth/callback/openai';
const SCOPE = 'openid email profile offline_access model.request model.read organization.read organization.write';
const AUDIENCE = 'https://api.openai.com/v1';

function debug(...messages) {
  if (DEBUG_LOG) {
    console.log('[debug]', ...messages);
  }
}

function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const snapChromium = '/snap/bin/chromium';
  if (fs.existsSync(snapChromium)) {
    return snapChromium;
  }

  return undefined;
}

async function waitForAnySelector(page, selectors, options = {}) {
  let lastError;
  for (const selector of selectors) {
    try {
      debug(`Waiting for selector: ${selector}`);
      const handle = await page.waitForSelector(selector, options);
      if (handle) {
        debug(`Matched selector: ${selector}`);
        return handle;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`None of the selectors matched: ${selectors.join(', ')}`);
}

async function clearAndType(handle, value) {
  debug('Clearing existing value and typing into element.');
  await handle.evaluate((element) => {
    element.focus();
    if ('value' in element) {
      element.value = '';
    }
  });
  await handle.type(value, { delay: 50 });
}

async function clickFirstMatching(page, texts, extraSelectors = '') {
  const candidates = await page.$$(extraSelectors || 'button, [role="button"], a[role="button"]');
  for (const candidate of candidates) {
    const text = (await candidate.evaluate((el) => el.innerText || el.textContent || '')).trim().toLowerCase();
    if (!text) continue;
    if (texts.some((target) => text.includes(target))) {
      debug(`Clicking element with text: ${text}`);
      await candidate.click();
      return true;
    }
  }
  debug(`No matching button found for texts: ${texts.join(', ')}`);
  return false;
}

async function ensureOnChatGPT(page) {
  try {
    debug('Ensuring we are on chatgpt.com...');
    await page.waitForFunction(
      () => location.hostname.endsWith('chatgpt.com'),
      { timeout: NAVIGATION_TIMEOUT }
    );
  } catch (_) {
    debug('Direct chatgpt.com check failed, forcing navigation.');
    await page.goto('https://chatgpt.com/', { waitUntil: 'networkidle0', timeout: NAVIGATION_TIMEOUT });
  }
}

async function fetchSession(page) {
  const session = await page.evaluate(async (timeout) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch('https://chatgpt.com/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });
      if (!response.ok) {
        return { error: `Session endpoint returned ${response.status}` };
      }
      return await response.json();
    } catch (error) {
      return { error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }, SESSION_TIMEOUT);

  if (session && !session.error) {
    if (session.accessToken) {
      return session.accessToken;
    }
    throw new Error('Session response did not contain accessToken.');
  }

  throw new Error(`Failed to fetch session: ${session ? session.error : 'unknown error'}`);
}

function parseJwt(token) {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch (error) {
    debug('JWT parse error:', error.message);
    return null;
  }
}

function updateEnvFile(token) {
  try {
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    const line = `AUTH_BEARER_TOKEN=${token}`;
    let nextContent;

    if (existing.includes('AUTH_BEARER_TOKEN=')) {
      nextContent = existing.replace(/AUTH_BEARER_TOKEN=.*/g, line);
    } else {
      nextContent = existing.trimEnd() + (existing.endsWith('\n') || existing.length === 0 ? '' : '\n') + line + '\n';
    }

    fs.writeFileSync(ENV_PATH, nextContent);
    console.log('✅ Updated .env with fresh AUTH_BEARER_TOKEN');
  } catch (error) {
    console.error('⚠️ Unable to update .env file:', error.message);
  }
}

function logTokenInfo(token) {
  const payload = parseJwt(token);
  if (!payload) {
    console.warn('⚠️ Could not decode JWT payload for display.');
    return;
  }

  const issued = new Date(payload.iat * 1000);
  const expires = new Date(payload.exp * 1000);
  const validityDays = Math.floor((payload.exp - payload.iat) / 86400);

  console.log('📅 Token details:');
  console.log(`   Issued at:  ${issued.toLocaleString()}`);
  console.log(`   Expires at: ${expires.toLocaleString()}`);
  console.log(`   Valid for:  ${validityDays} day(s)`);
  console.log('');
}

async function loginAndGetToken() {
  console.log('\n🚀 Starting automated OpenAI login flow...\n');

  const executablePath = resolveExecutablePath();
  if (executablePath) {
    debug(`Using Chromium executable at ${executablePath}`);
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS_MODE,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=en-US',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: { width: 1280, height: 800 },
    timeout: LOGIN_TIMEOUT
  });

  try {
    const page = await browser.newPage();

    page.on('console', (message) => {
      if (DEBUG_LOG) {
        console.log('[page log]', message.text());
      }
    });

    page.on('response', (response) => {
      if (DEBUG_LOG) {
        console.log('[response]', response.status(), response.url());
      }
    });

    await page.setUserAgent(
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': process.env.ACCEPT_LANGUAGE || 'en-US,en;q=0.9'
    });

    // Go directly to the phone number login page
    const phoneLoginUrl = 'https://auth.openai.com/log-in-or-create-account?usernameKind=phone_number';
    
    console.log('🌐 Opening OpenAI phone number login page...');
    debug(`Navigating to: ${phoneLoginUrl}`);
    await page.goto(phoneLoginUrl, { waitUntil: 'networkidle0', timeout: LOGIN_TIMEOUT });
    debug(`Initial page URL: ${page.url()}`);
    debug(`Page title: ${await page.title()}`);
    
    // Wait for the page to be fully loaded and stable
    await new Promise(resolve => setTimeout(resolve, 3000));
    debug('Page should be stable now');

    // Some accounts land on ChatGPT directly if a valid session already exists.
    const initialHost = new URL(page.url()).hostname;
    if (!initialHost.endsWith('auth.openai.com')) {
      debug(`Already on ${page.url()}, skipping credential entry.`);
    } else {
      console.log('📱 Entering phone number...');
      debug('Looking for phone number input field...');
      
      // Wait for the page to be fully interactive
      await page.waitForFunction(() => {
        return document.readyState === 'complete' && 
               !document.querySelector('[data-testid="loading"]') &&
               !document.querySelector('.loading');
      }, { timeout: 10000 });
      
      debug('Page is fully interactive, looking for input field...');
      
      const usernameInput = await waitForAnySelector(page, [
        'input[name="username"]',
        'input[type="email"]',
        'input[type="text"]',
        'input[type="tel"]',
        '#username',
        'input[placeholder*="phone"]',
        'input[placeholder*="number"]'
      ], { visible: true, timeout: LOGIN_TIMEOUT });

      debug('Found phone number input field');
      
      // Clear the field and enter phone number (without +1 since it's already there)
      const phoneNumberOnly = PHONE_NUMBER.replace(/^\+1/, '').trim();
      debug(`Entering phone number: ${phoneNumberOnly}`);
      
      // Use a more robust typing method with error handling
      try {
        await usernameInput.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        await usernameInput.evaluate(el => el.value = '');
        await usernameInput.type(phoneNumberOnly, { delay: 100 });
        debug('Phone number entered successfully');
      } catch (error) {
        debug(`Error entering phone number: ${error.message}`);
        // Try alternative method
        await page.evaluate((phone) => {
          const input = document.querySelector('input[name="username"], input[type="tel"], input[type="text"]');
          if (input) {
            input.focus();
            input.value = '';
            input.value = phone;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, phoneNumberOnly);
        debug('Phone number entered via alternative method');
      }

      console.log('📨 Submitting phone number...');
      debug(`Current URL before submit: ${page.url()}`);

      // Try pressing Enter first
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      debug(`URL after Enter key: ${page.url()}`);

      // If still on the same page, try clicking a button
      if ((await page.url()).includes('log-in-or-create-account')) {
        debug('Still on phone number page, trying button click...');
        const clicked = await clickFirstMatching(page, ['continue', 'next', 'log in', 'sign in']);
        if (clicked) {
          debug('Clicked button, waiting for navigation...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          debug(`URL after button click: ${page.url()}`);
        } else {
          debug('No matching button found to click');
        }
      }

      console.log('🔑 Entering password...');
      debug('Looking for password input field...');
      
      const passwordInput = await waitForAnySelector(page, [
        'input[type="password"]',
        'input[name="password"]',
        '#password'
      ], { visible: true, timeout: LOGIN_TIMEOUT });

      debug('Found password input field');
      await clearAndType(passwordInput, PASSWORD);
      debug('Password entered successfully');

      console.log('📨 Submitting password...');
      debug(`Current URL before password submit: ${page.url()}`);

      // Try pressing Enter first
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      debug(`URL after password Enter key: ${page.url()}`);

      // If still on password page, try clicking a button
      if ((await page.url()).includes('log-in/password')) {
        debug('Still on password page, trying button click...');
        const clicked = await clickFirstMatching(page, ['continue', 'next', 'log in', 'sign in', 'allow', 'accept']);
        if (clicked) {
          debug('Clicked password button, waiting for navigation...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          debug(`URL after password button click: ${page.url()}`);
        } else {
          debug('No matching password button found to click');
        }
      }
    }

    console.log('⏳ Waiting for ChatGPT redirect...');
    await ensureOnChatGPT(page);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const token = await fetchSession(page);
    console.log('\n✅ Authentication complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('New JWT bearer token:\n');
    console.log(token);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    logTokenInfo(token);

    if (SHOULD_UPDATE_ENV) {
      updateEnvFile(token);
    } else {
      console.log('💡 Tip: run with --update-env to persist the token into .env\n');
    }

    return token;
  } finally {
    if (!ARG_SET.has('--keep-browser')) {
      await browser.close();
    } else {
      console.log('⚠️ Browser left open (--keep-browser flag detected).');
    }
  }
}

module.exports = { loginAndGetToken };

loginAndGetToken().catch((error) => {
  console.error('\n❌ Failed to retrieve token:', error.message);
  if (!DEBUG_LOG) {
    console.error('   Re-run with --debug for verbose logging.');
  }
  console.error('\nTroubleshooting tips:');
  console.error(' - Confirm PHONE_NUMBER and PASSWORD in .env are correct.');
  console.error(' - Disable 2FA or provide backup codes if prompted.');
  console.error(' - Run with --show for a visible browser to inspect the flow.');
  console.error('');
  process.exit(1);
});
