// Capture the real app states the demo video shows, at 2x. Needs a running
// instance with the seeded demo site (see seed.sh) and Playwright on NODE_PATH.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

// Usage: BASE=http://127.0.0.1:8787 COOKIE="f404_session=…" SITE_ID=… SITE_KEY=… node capture.mjs
//   (seed.sh prints the three values after seeding a local instance)
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const OUT = new URL('./assets/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const cookie = (process.env.COOKIE ?? '').split('=');
const siteId = process.env.SITE_ID ?? '';
const siteKey = process.env.SITE_KEY ?? '';
if (!cookie[1] || !siteId || !siteKey) { console.error('COOKIE, SITE_ID and SITE_KEY are required (see seed.sh)'); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: BASE }]);
const page = await ctx.newPage();
// hide the live cursor-dependent hover styles; the video draws its own cursor
await page.addStyleTag({ content: '* { caret-color: transparent !important; }' }).catch(() => {});
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); await page.addStyleTag({ content: '*{caret-color:transparent!important}' }); };

// 1. overview (before any triage changes)
await go(`/app/sites/${siteId}`);
await shot('overview');

// 2. link detail + Vercel tab + copied state (first row = getting-startd)
await go(`/app/sites/${siteId}/links`);
const href = await page.locator('tbody a[href*="/links/"]').first().getAttribute('href');
await go(href);
await shot('detail');
await page.getByRole('tab', { name: 'Vercel' }).click();
await page.waitForTimeout(250);
await shot('detail-vercel');
await page.getByRole('button', { name: 'Copy redirect rule' }).click();
await page.waitForTimeout(200);
await shot('detail-copied');

// 3. crawler
await go(`/app/sites/${siteId}/crawl`);
await shot('crawl');

// 4. links: plain → one selected → two selected (bulk bar) → resolved (toast)
await go(`/app/sites/${siteId}/links`);
await shot('links');
const boxes = page.locator('tbody input[type=checkbox]');
await boxes.nth(0).check();
await page.waitForTimeout(150);
await shot('links-sel1');
await boxes.nth(1).check();
await page.waitForTimeout(300);
await shot('links-sel2');
await page.getByRole('toolbar', { name: 'Bulk actions' }).getByRole('button', { name: 'Resolve' }).click();
await page.waitForTimeout(700);
await shot('links-after');

// 5. the embed widget (inline, real), element screenshot
const anon = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await anon.goto(`${BASE}/embed-preview.html?site=${siteKey}&mode=inline&url=${encodeURIComponent('https://docs.acme.dev/docs/getting-startd')}`, { waitUntil: 'networkidle' });
await anon.waitForTimeout(800);
await anon.locator('#suggestions').screenshot({ path: `${OUT}/widget.png` });

// geometry the composition needs (CSS px, 1x) for cursor targets
const rects = {};
await go(`/app/sites/${siteId}/links`);
for (const [k, loc] of Object.entries({
  box1: page.locator('tbody input[type=checkbox]').nth(0),
  box2: page.locator('tbody input[type=checkbox]').nth(1),
  tabsRow: page.locator('[role=tablist]').first(),
})) { const b = await loc.boundingBox(); rects[k] = b; }
await boxes.nth(0).check(); await boxes.nth(1).check(); await page.waitForTimeout(300);
rects.resolveBtn = await page.getByRole('toolbar', { name: 'Bulk actions' }).getByRole('button', { name: 'Resolve' }).boundingBox();
await go(href);
rects.vercelTab = await page.getByRole('tab', { name: 'Vercel' }).boundingBox();
rects.copyBtn = await page.getByRole('button', { name: 'Copy redirect rule' }).boundingBox();
rects.fixesCard = await page.getByText('Suggested fixes').first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').boundingBox();
rects.redirectCard = await page.getByText('Redirect rule').first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').boundingBox();
await go(`/app/sites/${siteId}`);
rects.stats = await page.locator('.grid.grid-cols-2').first().boundingBox();
rects.needs = await page.getByText('Needs attention').first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').boundingBox();
rects.chart = await page.getByText('404 hits per day').first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').boundingBox();
await go(`/app/sites/${siteId}/crawl`);
rects.results = await page.getByText('Latest results').first().locator('xpath=ancestor::section[1]').boundingBox();
fs.writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 2));
console.log(JSON.stringify(rects));
await browser.close();
console.log('captured', fs.readdirSync(OUT).filter((f) => f.endsWith('.png')));
