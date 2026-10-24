// Assembles the marketing site: site/layout.html + site/pages/*.html → dist/web/,
// copies site/assets/* alongside, and writes sitemap.xml + robots.txt.
// Pages start with a <!--meta {json} --> block (path, title, description, og, nav).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);
const OUT = path.resolve(ROOT, '..', 'dist', 'web');
const SITE_URL = (process.env.SITE_URL ?? 'https://404less.com').replace(/\/$/, '');

const layout = fs.readFileSync(path.join(ROOT, 'layout.html'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

// assets (css, images, og) → dist/web/
fs.cpSync(path.join(ROOT, 'assets'), OUT, { recursive: true });

// the product demo (rendered by docs/demo, committed there) → dist/web/demo/
const DEMO = path.resolve(ROOT, '..', 'docs', 'demo', '404less-demo.mp4');
if (fs.existsSync(DEMO)) {
  fs.mkdirSync(path.join(OUT, 'demo'), { recursive: true });
  fs.copyFileSync(DEMO, path.join(OUT, 'demo', '404less-demo.mp4'));
} else {
  console.warn('site: docs/demo/404less-demo.mp4 missing; the hero player will have no video');
}

const urls = [];
for (const file of fs.readdirSync(path.join(ROOT, 'pages')).filter((f) => f.endsWith('.html')).sort()) {
  const src = fs.readFileSync(path.join(ROOT, 'pages', file), 'utf8');
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->/);
  if (!m) throw new Error(`${file}: missing <!--meta--> block`);
  const meta = JSON.parse(m[1]);
  const content = src.slice(m[0].length).trim();
  const canonical = SITE_URL + (meta.path === '/' ? '/' : meta.path);
  const jsonld = JSON.stringify(meta.path === '/' ? {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'SoftwareApplication',
      name: '404less',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description: meta.description,
      url: SITE_URL,
      license: 'https://opensource.org/licenses/MIT',
      codeRepository: 'https://github.com/AshikNesin/404less',
    }, {
      '@type': 'VideoObject',
      name: '404less product demo',
      description: 'One script tag, one list of broken links, one fix. A 65-second tour of 404less.',
      thumbnailUrl: SITE_URL + '/img/demo-poster.webp',
      contentUrl: SITE_URL + '/demo/404less-demo.mp4',
      uploadDate: '2026-10-24',
      duration: 'PT1M5S',
    }],
  } : { '@context': 'https://schema.org', '@type': 'WebPage', name: meta.title, description: meta.description, url: canonical });
  const html = layout
    .replaceAll('{{title}}', esc(meta.title))
    .replaceAll('{{ogTitle}}', esc(meta.ogTitle ?? meta.title))
    .replaceAll('{{description}}', esc(meta.description))
    .replaceAll('{{canonical}}', canonical)
    .replaceAll('{{ogImage}}', SITE_URL + meta.og)
    .replaceAll('{{nav}}', meta.nav ?? 'none')
    .replace('{{jsonld}}', jsonld)
    .replace('<meta name="theme-color"', (meta.noindex ? '<meta name="robots" content="noindex">\n  ' : '') + '<meta name="theme-color"')
    .replace('{{content}}', () => content);
  const outName = meta.path === '/' ? 'index.html' : `${meta.path.replace(/^\//, '')}.html`;
  fs.writeFileSync(path.join(OUT, outName), html);
  if (!meta.noindex) urls.push(canonical);
  console.log('site:', meta.path, '→', outName);
}

fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
