// Public ingest endpoints used by the embed script.
import { Hono } from 'hono';
import { siteForUser, siteFilters } from './helpers';
import { rankSuggestions, urlMatchesPattern } from '../lib/suggest';
import type { Env } from '../types';

export const ingest = new Hono<{ Bindings: Env }>();

ingest.post('/track', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.siteKey || !body?.url) return c.json({ error: 'bad request' }, 400);
  const site = await c.env.DB.prepare('SELECT * FROM websites WHERE site_key = ?')
    .bind(body.siteKey)
    .first<{ id: string; ignore_status_codes: string; exclude_patterns: string }>();
  if (!site) return c.json({ error: 'unknown site' }, 404);

  // Basic origin sanity: URL must be absolute http(s)
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return c.json({ error: 'bad url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return c.json({ error: 'bad url' }, 400);

  // Per-site exclusions (RICE 203): drop events the user chose to ignore.
  const { excludes } = siteFilters(site as never);
  if (excludes.some((p) => urlMatchesPattern(parsed.toString(), p))) return c.json({ ok: true, ignored: true });

  await c.env.DB.prepare(
    'INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), site.id, parsed.toString(), body.referrer ?? null, c.req.header('User-Agent') ?? null, Date.now())
    .run();

  // forward to per-site digest DO (no-op until channels exist; alarm flushes)
  const doStub = c.env.DIGEST.get(c.env.DIGEST.idFromName(site.id));
  c.executionCtx.waitUntil(
    doStub.fetch('https://digest/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: parsed.toString(), ts: Date.now(), referrer: body.referrer ?? null }),
    }),
  );
  return c.json({ ok: true });
});

ingest.get('/suggestions', async (c) => {
  const siteKey = c.req.query('site');
  const url = c.req.query('url');
  if (!siteKey || !url) return c.json({ error: 'bad request' }, 400);
  const site = await c.env.DB.prepare('SELECT id FROM websites WHERE site_key = ?').bind(siteKey).first<{ id: string }>();
  if (!site) return c.json({ error: 'unknown site' }, 404);
  const known = await c.env.DB.prepare(
    'SELECT url, title FROM known_urls WHERE website_id = ? LIMIT 5000',
  ).bind(site.id).all<{ url: string; title: string | null }>();
  return c.json({ suggestions: rankSuggestions(url, known.results) });
});
