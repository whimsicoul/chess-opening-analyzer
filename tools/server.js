import { chromium } from 'playwright';

let browser;
let page;

async function ensureBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  if (!page) {
    page = await browser.newPage();
  }
}

export async function open(url) {
  await ensureBrowser();
  await page.goto(url);
  return `Opened ${url}`;
}

export async function screenshot() {
  if (!page) return "No page open";
  const path = "tools/mcp-tools/screenshot.png";
  await page.screenshot({ path });
  return `Saved screenshot to ${path}`;
}

export async function content() {
  if (!page) return "No page open";
  return await page.content();
}