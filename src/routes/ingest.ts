// Public ingest endpoints used by the embed script.
import { Hono } from 'hono';
import { siteFilters } from '../server/features/sites/service';
import { recordVisitorHit, suggestFor } from '../server/features/links/service';
import { urlMatchesPattern } from '../lib/suggest';
import type { Env } from '../types';

export const ingest = new Hono<{ Bindings: Env }>();

ingest.post('/track', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.siteKey || !body?.url || typeof body.url !== 'string') return c.json({ error: 'bad request' }, 400);
  const site = await c.env.DB.prepare('SELECT id, domain, ignore_status_codes, exclude_patterns FROM websites WHERE site_key = ?')
    .bind(String(body.siteKey))
    .first<{ id: string; domain: string; ignore_status_codes: string; exclude_patterns: string }>();
  if (!site) return c.json({ error: 'unknown site' }, 404);

  // URL must be absolute http(s); strip fragments (never sent to servers, never a distinct page)
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return c.json({ error: 'bad url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return c.json({ error: 'bad url' }, 400);
  parsed.hash = '';
  const url = parsed.toString().slice(0, 2000);
  const referrer = typeof body.referrer === 'string' && body.referrer ? body.referrer.slice(0, 2000) : null;

  // Per-site rate limit (protects the free-tier D1 write budget)
  const rl = c.env.RATELIMIT.get(c.env.RATELIMIT.idFromName(site.id));
  const verdict = await rl.fetch(`https://ratelimit/${site.id}/check`, { method: 'POST' });
  if (verdict.status === 429) return c.json({ ok: true, limited: true });

  // Per-site exclusions: drop events the user chose to ignore.
  const { excludes } = siteFilters(site);
  if (excludes.some((p) => urlMatchesPattern(url, p))) return c.json({ ok: true, ignored: true });

  const ts = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), site.id, url, referrer, c.req.header('User-Agent')?.slice(0, 500) ?? null, ts).run();
  const outcome = await recordVisitorHit(c.env, site.id, url, ts);

  // Ignored links are still counted, but never alert. Everything else goes to the
  // per-site digest DO, which groups hits per URL and flushes once per window.
  if (outcome.status !== 'ignored') {
    const doStub = c.env.DIGEST.get(c.env.DIGEST.idFromName(site.id));
    c.executionCtx.waitUntil(
      doStub.fetch('https://digest/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ts, referrer }),
      }),
    );
  }
  return c.json({ ok: true });
});

ingest.get('/suggestions', async (c) => {
  const siteKey = c.req.query('site');
  const url = c.req.query('url');
  if (!siteKey || !url) return c.json({ error: 'bad request' }, 400);
  const site = await c.env.DB.prepare('SELECT id, domain FROM websites WHERE site_key = ?').bind(siteKey)
    .first<{ id: string; domain: string }>();
  if (!site) return c.json({ error: 'unknown site' }, 404);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 3) || 3, 1), 5);
  const suggestions = await suggestFor(c.env, site.id, url, limit);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ suggestions, home: `https://${site.domain}/` });
});
