// Authenticated: POST /api/sites/:id/import-sitemap — fetch sitemap.xml (follows
// one level of <sitemapindex>), store known URLs in D1 for the suggestions engine.
import { Hono } from 'hono';
import { isValidHttpUrl, parseSitemap, titleFromUrl } from '../lib/sitemap';
import { newId, now } from '../lib/auth';
import { siteForUser } from './helpers';
import type { Env } from '../types';

export const sitemap = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const MAX_URLS = 5000;       // free-tier friendly cap per import
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;

sitemap.post('/sites/:id/import-sitemap', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);

  const body = await c.req.json().catch(() => ({}));
  const sitemapUrl =
    (body?.sitemapUrl as string | undefined) ??
    `https://${site.site.domain}/sitemap.xml`;
  const parsedInput = isValidHttpUrl(sitemapUrl);
  if (!parsedInput) return c.json({ error: 'invalid sitemap url' }, 400);

  // Fetch root sitemap
  const collected: string[] = [];
  let toFetch = [parsedInput.toString()];
  const seen = new Set<string>();
  let hops = 0;

  while (toFetch.length && collected.length < MAX_URLS && hops < 12) {
    const batch = toFetch.splice(0, 5);
    hops++;
    const docs = await Promise.all(
      batch.map(async (u) => {
        try {
          const res = await fetch(u, {
            redirect: 'follow',
            headers: { 'User-Agent': '404less-bot/0.1 (+https://404less.dev)' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return null;
          const text = await res.text();
          if (text.length > MAX_SITEMAP_BYTES) return null;
          return parseSitemap(text);
        } catch {
          return null;
        }
      }),
    );
    for (const doc of docs) {
      if (!doc) continue;
      collected.push(...doc.urls);
      for (const s of doc.sitemaps) {
        if (!seen.has(s) && seen.size < 50) {
          seen.add(s);
          toFetch.push(s);
        }
      }
    }
  }

  // Keep only same-host URLs, dedupe
  const host = site.site.domain.replace(/^www\./, '');
  const rows = new Map<string, [string, string]>(); // url -> [id, title]
  for (const u of collected) {
    const parsed = isValidHttpUrl(u);
    if (!parsed) continue;
    const h = parsed.hostname.replace(/^www\./, '');
    if (h !== host) continue;
    if (parsed.hash || parsed.search) continue; // canonical pages only
    rows.set(parsed.toString(), [newId(), titleFromUrl(parsed.toString())]);
    if (rows.size >= MAX_URLS) break;
  }

  if (!rows.size) return c.json({ error: 'no usable urls found in sitemap' }, 422);

  // Insert in chunks (D1 batch limits)
  const ts = now();
  let inserted = 0;
  const entries = [...rows.entries()];
  for (let i = 0; i < entries.length; i += 50) {
    const stmts = entries.slice(i, i + 50).map(([url, [id, title]]) =>
      c.env.DB.prepare(
        `INSERT INTO known_urls (id, website_id, url, title, source, added_at)
         VALUES (?, ?, ?, ?, 'sitemap', ?)
         ON CONFLICT(website_id, url) DO UPDATE SET title = excluded.title`,
      ).bind(id, site.site.id, url, title, ts),
    );
    const results = await c.env.DB.batch(stmts);
    inserted += results.filter((r) => r.success).length;
  }

  return c.json({ ok: true, imported: rows.size, inserted });
});

sitemap.get('/sites/:id/known-urls', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
  const rows = await c.env.DB.prepare(
    'SELECT url, title, source, added_at FROM known_urls WHERE website_id = ? ORDER BY added_at DESC LIMIT ?',
  ).bind(site.site.id, limit).all();
  return c.json({ knownUrls: rows.results });
});
