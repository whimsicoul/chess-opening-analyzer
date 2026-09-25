import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const EMAIL    = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD env vars');

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 });

// Go to white first (as test does)
await page.goto(`${BASE}/repertoire/white`);
await page.waitForLoadState('networkidle');
console.log('White line-card count:', await page.locator('.line-card').count());

// Now black
await page.goto(`${BASE}/repertoire/black`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

const cards = await page.locator('.line-card').count();
const empty = await page.locator('.empty-state').count();
console.log('Black line-card count:', cards);
console.log('Empty-state count:', empty);

// Check what the lines section says
const sectionText = await page.locator('.rep-section-header').textContent().catch(() => 'not found');
console.log('Section header text:', sectionText);

await page.screenshot({ path: 'tools/debug-black.png' });
console.log('Screenshot saved to tools/debug-black.png');

await browser.close();
