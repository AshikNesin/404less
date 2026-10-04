// Public ingest endpoints used by the embed script.
import { Hono } from 'hono';
import type { Env } from '../types';

export const ingest = new Hono<{ Bindings: Env }>();

ingest.post('/track', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.siteKey || !body?.url) return c.json({ error: 'bad request' }, 400);
  const site = await c.env.DB.prepare('SELECT id FROM websites WHERE site_key = ?')
    .bind(body.siteKey)
    .first<{ id: string }>();
  if (!site) return c.json({ error: 'unknown site' }, 404);

  // Basic origin sanity: URL must be absolute http(s)
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return c.json({ error: 'bad url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return c.json({ error: 'bad url' }, 400);

  await c.env.DB.prepare(
    'INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), site.id, parsed.toString(), body.referrer ?? null, c.req.header('User-Agent') ?? null, Date.now())
    .run();
  return c.json({ ok: true });
});

ingest.get('/suggestions', async (c) => {
  const siteKey = c.req.query('site');
  const url = c.req.query('url');
  if (!siteKey || !url) return c.json({ error: 'bad request' }, 400);
  // M1: no suggestions yet (known_urls lands with the crawler/sitemap import in M2+).
  return c.json({ suggestions: [] });
});
