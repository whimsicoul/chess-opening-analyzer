/**
 * Playwright smoke test: separate white/black repertoire pages
 * Run: node tools/test-repertoire.js
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const EMAIL    = 'thomasashercoulon@gmail.com';
const PASSWORD = 'Ariell_4422!';

let browser, page;
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function login() {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 });
}

async function run() {
  browser = await chromium.launch({ headless: true });
  page    = await browser.newPage();

  try {
    // ── 1. Login ──────────────────────────────────────────────────────────────
    console.log('\n[1] Login');
    await login();
    assert(!page.url().includes('/login'), 'redirected away from login after auth');

    // ── 2. /repertoire redirects to /repertoire/white ─────────────────────────
    console.log('\n[2] /repertoire redirect');
    await page.goto(`${BASE}/repertoire`);
    await page.waitForURL(`${BASE}/repertoire/white`, { timeout: 5000 });
    assert(page.url().endsWith('/repertoire/white'), '/repertoire redirects to /repertoire/white');

    // ── 3. White page content ─────────────────────────────────────────────────
    console.log('\n[3] White repertoire page');
    const whiteH1 = await page.textContent('h1');
    assert(whiteH1.includes('White Repertoire'), 'h1 says "White Repertoire"');
    assert(whiteH1.includes('♔'), 'h1 contains white king icon');

    // No color tab buttons on white page
    const tabs = await page.locator('.rep-color-tabs').count();
    assert(tabs === 0, 'no color tab bar on white page');

    // Navbar has both links
    const whiteLink = await page.locator('a[href="/repertoire/white"]').count();
    const blackLink = await page.locator('a[href="/repertoire/black"]').count();
    assert(whiteLink > 0, 'navbar has ♔ White link');
    assert(blackLink > 0, 'navbar has ♚ Black link');

    // Wait for lines to load and confirm section shows white badge
    await page.waitForSelector('.rep-section', { timeout: 6000 });
    const whiteBadge = await page.locator('.badge-color-white').first().count();
    assert(whiteBadge > 0, 'white badge present in section header');

    // Confirm black badge does NOT appear (no black section on white page)
    const blackBadge = await page.locator('.badge-color-black').count();
    assert(blackBadge === 0, 'no black badge on white page');

    // ── 4. Black page content ─────────────────────────────────────────────────
    console.log('\n[4] Black repertoire page');
    await page.goto(`${BASE}/repertoire/black`);
    await page.waitForURL(`${BASE}/repertoire/black`, { timeout: 5000 });

    const blackH1 = await page.textContent('h1');
    assert(blackH1.includes('Black Repertoire'), 'h1 says "Black Repertoire"');
    assert(blackH1.includes('♚'), 'h1 contains black king icon');

    const tabsOnBlack = await page.locator('.rep-color-tabs').count();
    assert(tabsOnBlack === 0, 'no color tab bar on black page');

    await page.waitForSelector('.rep-section', { timeout: 6000 });
    const blackBadgeOnBlack = await page.locator('.badge-color-black').first().count();
    assert(blackBadgeOnBlack > 0, 'black badge present in section header');

    const whiteBadgeOnBlack = await page.locator('.badge-color-white').count();
    assert(whiteBadgeOnBlack === 0, 'no white badge on black page');

    // ── 5. White lines appear on white page, not black page ───────────────────
    console.log('\n[5] Line isolation');
    await page.goto(`${BASE}/repertoire/white`);
    await page.waitForLoadState('networkidle');
    const whiteLineCount = await page.locator('.line-card').count();
    assert(whiteLineCount > 0, `white page shows ${whiteLineCount} line card(s)`);

    await page.goto(`${BASE}/repertoire/black`);
    // Wait for either an empty state or confirm no line cards exist
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800); // allow React to flush state after fetch settles
    const blackLineCount = await page.locator('.line-card').count();
    const emptyState = await page.locator('.empty-state').count();
    assert(emptyState > 0 || blackLineCount === 0, 'black page shows empty state (no black lines saved)');

    // ── 6. Navbar active link highlights correct page ─────────────────────────
    console.log('\n[6] Navbar active state');
    await page.goto(`${BASE}/repertoire/white`);
    await page.waitForLoadState('networkidle');
    const activeWhite = await page.locator('a[href="/repertoire/white"][aria-current="page"]').count();
    assert(activeWhite > 0, '♔ White navbar link is active on white page');

    await page.goto(`${BASE}/repertoire/black`);
    await page.waitForLoadState('networkidle');
    const activeBlack = await page.locator('a[href="/repertoire/black"][aria-current="page"]').count();
    assert(activeBlack > 0, '♚ Black navbar link is active on black page');

  } catch (err) {
    console.error('\nUnhandled error:', err.message);
    failed++;
  } finally {
    await browser.close();
    console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
