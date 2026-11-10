// Assembles the marketing site: site/layout.html + site/pages/**/*.html → dist/client/,
// copies site/assets/* alongside, and writes sitemap.xml + robots.txt.
// Runs after the SPA build (`pnpm build:client` = vp build && this): the SPA's
// index.html becomes app.html (the Worker serves it for /app/*), because the
// marketing home page owns /index.html.
// Pages start with a <!--meta {json} --> block (path, title, description, og, nav).
// "draft": true forces noindex, drops the URL from the sitemap, and prepends a
// review banner. Remove the flag to publish. See site/CONTENT.md.
// {{cta}} in a page is replaced with site/partials/cta.html.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname);
const OUT = path.resolve(ROOT, "..", "dist", "client");
const SITE_URL = (process.env.SITE_URL ?? "https://404less.com").replace(/\/$/, "");

const layout = fs.readFileSync(path.join(ROOT, "layout.html"), "utf8");
fs.mkdirSync(OUT, { recursive: true });

// the SPA shell: vp build emits dist/client/index.html; the Worker serves it as /app.html
const spaIndex = path.join(OUT, "index.html");
if (fs.existsSync(spaIndex) && fs.readFileSync(spaIndex, "utf8").includes('<div id="root">')) {
  fs.renameSync(spaIndex, path.join(OUT, "app.html"));
} else if (!fs.existsSync(path.join(OUT, "app.html"))) {
  console.warn("site: no SPA build in dist/client (run vp build first); /app will 404");
}

// assets (css, images, og) → dist/client/
fs.cpSync(path.join(ROOT, "assets"), OUT, { recursive: true });

// the product demo (rendered by docs/demo, committed there) → dist/client/demo/
const DEMO = path.resolve(ROOT, "..", "docs", "demo", "404less-demo.mp4");
if (fs.existsSync(DEMO)) {
  fs.mkdirSync(path.join(OUT, "demo"), { recursive: true });
  fs.copyFileSync(DEMO, path.join(OUT, "demo", "404less-demo.mp4"));
} else {
  console.warn("site: docs/demo/404less-demo.mp4 missing; the hero player will have no video");
}

const cta = fs.readFileSync(path.join(ROOT, "partials", "cta.html"), "utf8").trim();
const urls = [];
const seen = new Set();
for (const file of walk(path.join(ROOT, "pages"))) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(path.join(ROOT, "pages"), file);
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->/);
  if (!m) throw new Error(`${rel}: missing <!--meta--> block`);
  const meta = JSON.parse(m[1]);
  if (seen.has(meta.path)) throw new Error(`${rel}: duplicate path ${meta.path}`);
  seen.add(meta.path);
  const draft = meta.draft === true;
  const noindex = draft || meta.noindex === true;
  let content = src.slice(m[0].length).trim().replaceAll("{{cta}}", () => cta);
  if (draft) {
    content =
      `<aside class="draft-banner" role="note">Draft for review. This page sends <code>noindex</code> and is left out of the sitemap. To publish, remove <code>"draft": true</code> from its meta block. Steps are in the repo at <code>site/CONTENT.md</code>.</aside>\n` +
      content;
  }
  const canonical = SITE_URL + (meta.path === "/" ? "/" : meta.path);
  const jsonld = JSON.stringify(
    meta.path === "/"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "404less",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              description: meta.description,
              url: SITE_URL,
              license: "https://opensource.org/licenses/MIT",
              codeRepository: "https://github.com/AshikNesin/404less",
            },
            {
              "@type": "VideoObject",
              name: "404less product demo",
              description:
                "One script tag, one list of broken links, one fix. A 65-second tour of 404less.",
              thumbnailUrl: SITE_URL + "/img/demo-poster.webp",
              contentUrl: SITE_URL + "/demo/404less-demo.mp4",
              uploadDate: "2026-10-24",
              duration: "PT1M5S",
            },
          ],
        }
      : {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: meta.title,
          description: meta.description,
          url: canonical,
        },
  );
  const html = layout
    .replaceAll("{{title}}", esc(meta.title))
    .replaceAll("{{ogTitle}}", esc(meta.ogTitle ?? meta.title))
    .replaceAll("{{description}}", esc(meta.description))
    .replaceAll("{{canonical}}", canonical)
    .replaceAll("{{ogImage}}", SITE_URL + meta.og)
    .replaceAll("{{nav}}", meta.nav ?? "none")
    .replace("{{jsonld}}", jsonld)
    .replace(
      '<meta name="theme-color"',
      (noindex ? '<meta name="robots" content="noindex">\n  ' : "") + '<meta name="theme-color"',
    )
    .replace("{{content}}", () => content);
  const outName = meta.path === "/" ? "index.html" : `${meta.path.replace(/^\//, "")}.html`;
  const outPath = path.join(OUT, outName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  if (!noindex) urls.push(canonical);
  console.log("site:", meta.path, "→", outName, draft ? "(draft)" : "");
}

fs.writeFileSync(
  path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`,
);
fs.writeFileSync(
  path.join(OUT, "robots.txt"),
  `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith(".html")) out.push(p);
  }
  return out.sort();
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
