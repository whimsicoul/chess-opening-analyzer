import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const EMAIL    = 'thomasashercoulon@gmail.com';
const PASSWORD = 'Ariell_4422!';

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

// Intercept all API calls to /openings/
page.on('request', req => {
  if (req.url().includes('/openings/') && !req.url().includes('/openings/cloud')) {
    console.log('REQUEST:', req.method(), req.url());
  }
});
page.on('response', async res => {
  if (res.url().includes('/openings/') && !res.url().includes('/openings/cloud')) {
    const body = await res.json().catch(() => null);
    console.log('RESPONSE:', res.url(), '→', Array.isArray(body) ? `${body.length} items` : body);
  }
});

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 });

console.log('\n-- Navigating to /repertoire/white --');
await page.goto(`${BASE}/repertoire/white`);
await page.waitForLoadState('networkidle');

console.log('\n-- Navigating to /repertoire/black --');
await page.goto(`${BASE}/repertoire/black`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1000);

await browser.close();
