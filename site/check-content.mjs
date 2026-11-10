// Checks draft guides and comparisons, and that the redirect samples still match
// apps/web/src/client/features/links/redirect-snippet.tsx.
// With dist/client already built, also checks noindex + sitemap exclusion.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname);
const PAGES = path.join(ROOT, "pages");
const fail = [];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out.sort();
}

function decode(html) {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function textOf(html) {
  return decode(html.replace(/<[^>]+>/g, ""));
}

const queries = {
  "/guides/track-404s-cloudflare-pages": ["track 404 errors on Cloudflare Pages"],
  "/guides/netlify-redirects-not-working": ["Netlify redirects not working"],
  "/guides/vercel-redirects": [
    "Vercel redirects",
    "301 vs 308",
    "bulk redirects",
    "vercel.json vs middleware",
  ],
  "/guides/fix-soft-404-search-console": ["soft 404", "Google Search Console"],
  "/guides/custom-404-hugo-next-astro": ["custom 404 page", "Hugo", "Next.js", "Astro"],
  "/guides/fix-broken-links-with-mcp": ["broken links", "Claude Code", "Cursor"],
  "/guides/redirects-after-migration": ["Redirects after a site migration"],
  "/compare/404less-vs-404tracker": ["404less vs 404tracker"],
  "/compare/404less-vs-oh-dear": ["404less vs Oh Dear"],
  "/compare/404less-vs-dr-link-check": ["404less vs Dr. Link Check"],
  "/compare/404-logging-non-wordpress": ["404 logging for non-WordPress"],
};

const snippet = fs.readFileSync(
  path.resolve(ROOT, "../apps/web/src/client/features/links/redirect-snippet.tsx"),
  "utf8",
);
const platform = fs.readFileSync(
  path.resolve(ROOT, "../apps/web/src/client/features/sites/platform-snippet.tsx"),
  "utf8",
);
for (const needle of [
  "# _redirects (Cloudflare Pages / Netlify)\\n${from}  ${to}  301",
  "{ redirects: [{ source: from, destination: to, permanent: true }] }",
  "location = ${from} {\\n  return 301 ${to};\\n}",
  "# .htaccess\\nRedirect 301 ${from} ${to}",
  "next.config.js",
  "Add a 301 redirect from ${from} to ${to}",
]) {
  if (!snippet.includes(needle)) fail.push(`redirect-snippet.tsx missing ${needle}`);
}
if (!platform.includes('data-404="true" strategy="afterInteractive"')) {
  fail.push("platform-snippet.tsx no longer sets data-404 on the Next snippet");
}

const golden = {
  redirects: "# _redirects (Cloudflare Pages / Netlify)\n/docs/old  /docs/new  301",
  vercel: JSON.stringify(
    { redirects: [{ source: "/docs/old", destination: "/docs/new", permanent: true }] },
    null,
    2,
  ),
  next: `// next.config.js
module.exports = {
  async redirects() {
    return [{ source: "/docs/old", destination: "/docs/new", permanent: true }];
  },
};`,
  nginx: "location = /docs/old {\n  return 301 /docs/new;\n}",
  apache: "# .htaccess\nRedirect 301 /docs/old /docs/new",
  embed: '<script src="https://your-404less.example/embed.js" data-site="SITE_KEY" defer></script>',
  nextEmbed:
    '<Script src="https://your-404less.example/embed.js" data-site="SITE_KEY" data-404="true" strategy="afterInteractive" />',
};

const mustContain = {
  "/guides/track-404s-cloudflare-pages": [golden.redirects, golden.embed],
  "/guides/netlify-redirects-not-working": [golden.redirects],
  "/guides/vercel-redirects": [golden.vercel, golden.next],
  "/guides/custom-404-hugo-next-astro": [golden.embed, golden.nextEmbed],
  "/guides/redirects-after-migration": [
    golden.redirects,
    golden.vercel,
    golden.next,
    golden.nginx,
    golden.apache,
  ],
  "/guides/fix-broken-links-with-mcp": [
    "list_sites",
    "list_broken_links",
    "get_suggestions",
    "get_link_details",
    "2025-03-26",
    "Add a 301 redirect from /docs/old to /docs/new",
  ],
};

function checkBlock(kind, raw, where) {
  const code = decode(raw.replace(/<[^>]+>/g, "")).replace(/\n$/, "");
  if (kind === "json") {
    try {
      JSON.parse(code);
    } catch (err) {
      fail.push(`${where} JSON: ${err.message}`);
    }
  } else if (kind === "js") {
    const ext = /^\s*import\s/m.test(code) ? ".mjs" : ".cjs";
    const file = path.join(os.tmpdir(), `404less-guide-${process.pid}${ext}`);
    fs.writeFileSync(file, code);
    const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (r.status !== 0) fail.push(`${where} JS: ${r.stderr || r.stdout}`);
    fs.rmSync(file, { force: true });
  } else if (kind === "redirects") {
    for (const line of code.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 2 || parts.length > 4) {
        fail.push(`${where} redirect line has ${parts.length} fields: ${t}`);
        continue;
      }
      const status = parts[parts.length - 1];
      if (parts.length >= 3 && !/^\d{3}!?$/.test(status)) {
        fail.push(`${where} redirect status not a code: ${t}`);
      }
    }
  } else {
    fail.push(`${where} unknown data-check=${kind}`);
  }
}

const seen = new Set();
for (const file of walk(PAGES)) {
  const rel = path.relative(PAGES, file);
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->/);
  if (!m) {
    fail.push(`${rel}: missing meta`);
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(m[1]);
  } catch (err) {
    fail.push(`${rel}: meta JSON: ${err.message}`);
    continue;
  }
  if (seen.has(meta.path)) fail.push(`${rel}: duplicate path ${meta.path}`);
  seen.add(meta.path);
  const body = src.slice(m[0].length);
  const h1 = textOf((body.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/\s+/g, " ").trim();
  if (!h1) fail.push(`${rel}: no h1`);
  if (!meta.title || !meta.description || !meta.path || !meta.og) {
    fail.push(`${rel}: meta needs title, description, path, og`);
  }
  const draftSection = meta.path.startsWith("/guides") || meta.path.startsWith("/compare");
  if (draftSection && meta.draft !== true) {
    if (body.includes("[ASHIK:") || fs.readFileSync(path.join(ROOT, "partials/cta.html"), "utf8").includes("[ASHIK:")) {
      fail.push(`${rel}: published while an [ASHIK: note remains (page or site/partials/cta.html)`);
    }
  }
  if (draftSection && meta.draft !== true && meta.draft !== false && !("draft" in meta)) {
    // published on purpose
  }
  if (queries[meta.path]) {
    if (meta.draft !== true && body.includes("[ASHIK:")) {
      fail.push(`${meta.path}: still has [ASHIK: but draft is not true`);
    }
    const titleFold = meta.title.toLowerCase();
    const h1Fold = h1.toLowerCase();
    for (const q of queries[meta.path]) {
      const needle = q.toLowerCase();
      if (!titleFold.includes(needle)) fail.push(`${meta.path} title missing “${q}”`);
      if (!h1Fold.includes(needle)) fail.push(`${meta.path} h1 missing “${q}” (h1: ${h1})`);
    }
    if (!body.includes("{{cta}}")) fail.push(`${meta.path}: missing {{cta}}`);
    if (!body.includes("[ASHIK:") && meta.draft === true) {
      fail.push(`${meta.path}: draft has no [ASHIK: slot`);
    }
  }
  const plain = textOf(body);
  for (const needle of mustContain[meta.path] || []) {
    if (!plain.includes(needle) && !body.includes(needle)) {
      fail.push(`${meta.path} missing snippet:\n${needle}`);
    }
  }
  const pre = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/g;
  let pm;
  while ((pm = pre.exec(body))) {
    const kind = /data-check="([^"]+)"/.exec(pm[1]);
    if (kind) checkBlock(kind[1], pm[2], `${meta.path}`);
  }
}

const dist = path.resolve(ROOT, "../dist/client");
const sitemapPath = path.join(dist, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  for (const urlPath of Object.keys(queries)) {
    const built = path.join(dist, `${urlPath.slice(1)}.html`);
    if (!fs.existsSync(built)) {
      fail.push(`built file missing: ${built}`);
      continue;
    }
    const html = fs.readFileSync(built, "utf8");
    if (!html.includes('<meta name="robots" content="noindex">')) {
      fail.push(`${urlPath} built without noindex`);
    }
    if (!html.includes("Draft for review")) fail.push(`${urlPath} built without the draft banner`);
    if (sitemap.includes(`<loc>https://404less.com${urlPath}</loc>`)) {
      fail.push(`${urlPath} is in the sitemap`);
    }
    if (!html.includes("<h1>")) fail.push(`${urlPath} built without h1`);
  }
  for (const live of ["/", "/embed", "/self-host", "/agent"]) {
    const loc = live === "/" ? "https://404less.com/" : `https://404less.com${live}`;
    if (!sitemap.includes(`<loc>${loc}</loc>`)) fail.push(`sitemap missing ${loc}`);
  }
} else {
  console.log("check: dist/client not built; source checks only");
}

if (fail.length) {
  console.error(fail.join("\n\n"));
  process.exit(1);
}
console.log("check: guides and comparisons ok");
