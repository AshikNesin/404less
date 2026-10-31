// Renders the Open Graph images (1200×630) into site/assets/og/. Needs Playwright
// on NODE_PATH and the Inter / JetBrains Mono fonts installed.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const DIR = path.resolve(new URL(".", import.meta.url).pathname);
const OUT = path.resolve(DIR, "..", "assets", "og");
fs.mkdirSync(OUT, { recursive: true });
const img = (name) =>
  "data:image/webp;base64," +
  fs.readFileSync(path.resolve(DIR, "..", "assets", "img", name)).toString("base64");

const CARDS = [
  {
    file: "og.png",
    title: "Broken links, found and fixed before your visitors give up.",
    sub: "Realtime 404 tracking, a crawler, suggested fixes and quiet alerts in one minimal dashboard.",
    visual: `<div class="shot"><div class="bar"><i></i><i></i><i></i></div><img src="${img("overview.webp")}"></div>`,
  },
  {
    file: "og-embed.png",
    title: "One script tag. Visitors get the page they meant.",
    sub: "The snippet reports every 404 hit and shows the closest matching pages instead of a dead end.",
    visual: `<img class="widget" src="${img("widget.webp")}">`,
  },
  {
    file: "og-self-host.png",
    title: "Self-host in one click. Pay nothing at hobby scale.",
    sub: "One Worker with D1, Queues and Durable Objects. All on the Cloudflare Workers Free plan.",
    visual: `<div class="deploy"><span class="btn">Deploy to Cloudflare →</span>\n<span class="m">$</span> npx wrangler d1 create 404less\n<span class="m">$</span> npm run deploy\n<span class="c"># migrations + dashboard + worker</span></div>`,
  },
  {
    file: "og-agent.png",
    title: "Hand broken links to your agent.",
    sub: "A read-only MCP server. Claude Code or Cursor lists what’s broken and opens the fix PR.",
    visual: `<div class="term"><span class="m">$</span> claude mcp add --transport http \\\n    404less https://404less.com/mcp\n<span class="s">✓</span> <span class="m">Added 404less · 4 tools</span>\n\n<span class="k">›</span> Fix the top broken links.\n<span class="s">✓ Opened PR #142</span></div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const tpl = fs.readFileSync(path.join(DIR, "template.html"), "utf8");
for (const c of CARDS) {
  await page.setContent(tpl, { waitUntil: "load" });
  await page.evaluate(({ title, sub, visual }) => {
    const t = document.getElementById("title");
    t.textContent = title;
    if (title.length > 44) t.classList.add("sm");
    document.getElementById("sub").textContent = sub;
    document.getElementById("visual").innerHTML = visual;
    // place the subtitle under the (now sized) title
    const r = t.getBoundingClientRect();
    document.getElementById("sub").style.top = `${r.bottom + 22}px`;
  }, c);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, c.file), type: "png" });
  console.log("og:", c.file);
}
await browser.close();
