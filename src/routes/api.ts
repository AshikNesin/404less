// Authenticated dashboard API: teams, sites, events. Session-cookie guarded.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { newId, newSiteKey, now, SESSION_COOKIE, verifySession } from '../lib/auth';
import { sitemap } from './sitemap';
import { channels } from './channels';
import { siteForUser, topBrokenUrls } from '../server/features/sites/service';
import type { Env } from '../types';

export type Vars = { Variables: { userId: string } };
export const api = new Hono<{ Bindings: Env } & Vars>();

api.use('*', async (c, next) => {
  const userId = await verifySession(c.env, getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', userId as never);
  await next();
});

// mounted AFTER auth middleware
api.route('/', sitemap);   // POST /api/sites/:id/import-sitemap, GET /api/sites/:id/known-urls
api.route('/', channels);  // channels CRUD, alerts history, notify settings, test-send

// CSV export (RICE 153): events or aggregated by url
api.get('/sites/:id/events.csv', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const group = c.req.query('group') === 'url';
  const limit = Math.min(Number(c.req.query('limit') ?? 5000), 5000);
  type Row = { url: string; hits?: number; first_seen?: number; last_seen?: number; referrer?: string | null; user_agent?: string | null; ts?: number };
  const rows: { results: Row[] } = group
    ? await c.env.DB.prepare(
        'SELECT url, COUNT(*) AS hits, MIN(ts) AS first_seen, MAX(ts) AS last_seen FROM not_found_events WHERE website_id = ? GROUP BY url ORDER BY hits DESC LIMIT ?',
      ).bind(site.site.id, limit).all<{ url: string; hits: number; first_seen: number; last_seen: number }>()
    : await c.env.DB.prepare(
        'SELECT url, referrer, user_agent, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT ?',
      ).bind(site.site.id, limit).all<{ url: string; referrer: string | null; user_agent: string | null; ts: number }>();

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = group ? 'url,hits,first_seen,last_seen' : 'url,referrer,user_agent,ts';
  const body = rows.results.map((r) =>
    group
      ? [r.url, r.hits ?? 0, new Date(r.first_seen ?? 0).toISOString(), new Date(r.last_seen ?? 0).toISOString()].map(esc).join(',')
      : [r.url, r.referrer ?? '', r.user_agent ?? '', new Date(r.ts ?? 0).toISOString()].map(esc).join(','),
  ).join('\n');
  return c.body(`${header}\n${body}\n`, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="404less-${site.site.domain}${group ? '-grouped' : ''}.csv"`,
  });
});

// --- teams ---

api.get('/teams', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.owner_user_id, t.created_at FROM teams t
     JOIN team_members tm ON tm.team_id = t.id WHERE tm.user_id = ?`,
  ).bind(c.get('userId')).all();
  return c.json({ teams: rows.results });
});

api.post('/teams', async (c) => {
  const { name } = await c.req.json().catch(() => ({ name: null }));
  if (!name || typeof name !== 'string' || name.length > 100) return c.json({ error: 'invalid name' }, 400);
  const userId = c.get('userId');
  const teamId = newId();
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO teams (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)').bind(teamId, name, userId, ts),
    c.env.DB.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').bind(teamId, userId, 'owner'),
  ]);
  return c.json({ team: { id: teamId, name, owner_user_id: userId, created_at: ts } }, 201);
});

// --- sites ---

api.get('/sites', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT w.* FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id
     WHERE tm.user_id = ? ORDER BY w.created_at DESC`,
  ).bind(c.get('userId')).all();
  const sites = (rows.results as Record<string, unknown>[]).map((r) => ({
    ...r,
    ignore_status_codes: JSON.parse((r.ignore_status_codes as string) ?? '[]'),
    exclude_patterns: JSON.parse((r.exclude_patterns as string) ?? '[]'),
  }));
  return c.json({ sites });
});

api.post('/sites', async (c) => {
  const { teamId, name, domain } = await c.req.json().catch(() => ({}));
  if (!teamId || !name || !domain) return c.json({ error: 'teamId, name, domain required' }, 400);

  // membership check
  const member = await c.env.DB.prepare(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
  ).bind(teamId, c.get('userId')).first<{ role: string }>();
  if (!member) return c.json({ error: 'not a team member' }, 403);
  if (member.role === 'viewer') return c.json({ error: 'viewers cannot create sites' }, 403);

  // site quota (protects self-hoster free-tier limits; default 5)
  const maxSites = Number(c.env.MAX_SITES_PER_TEAM ?? 5);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM websites WHERE team_id = ?').bind(teamId).first<{ n: number }>();
  if (count!.n >= maxSites) return c.json({ error: `site limit reached (max ${maxSites})` }, 402);

  let host: string;
  try {
    host = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname.replace(/^www\./, '');
  } catch {
    return c.json({ error: 'invalid domain' }, 400);
  }

  const siteId = newId();
  const siteKey = newSiteKey();
  await c.env.DB.prepare(
    'INSERT INTO websites (id, team_id, name, domain, site_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(siteId, teamId, name, host, siteKey, now()).run();
  return c.json({ site: { id: siteId, team_id: teamId, name, domain: host, site_key: siteKey } }, 201);
});

api.patch('/sites/:id', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const body = await c.req.json().catch(() => ({}));

  const parse = (v: unknown, fallback: string): string => {
    if (Array.isArray(v) && v.every((x) => typeof x === 'number' && x >= 100 && x <= 599)) return JSON.stringify(v);
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length <= 200)) return JSON.stringify(v.slice(0, 100));
    return fallback;
  };
  const cur = await c.env.DB.prepare('SELECT ignore_status_codes, exclude_patterns FROM websites WHERE id = ?')
    .bind(site.site.id).first<{ ignore_status_codes: string; exclude_patterns: string }>();
  const ignore = body.ignore_status_codes !== undefined ? parse(body.ignore_status_codes, cur!.ignore_status_codes) : cur!.ignore_status_codes;
  const excl = body.exclude_patterns !== undefined ? parse(body.exclude_patterns, cur!.exclude_patterns) : cur!.exclude_patterns;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : site.site.name;
  const notify = typeof body?.notify_enabled === 'boolean' ? (body.notify_enabled ? 1 : 0) : undefined;
  const digest = Number.isInteger(body?.digest_minutes) && body.digest_minutes >= 5 && body.digest_minutes <= 1440
    ? body.digest_minutes : undefined;
  if (body?.digest_minutes !== undefined && digest === undefined) return c.json({ error: 'digest_minutes must be 5..1440' }, 400);

  await c.env.DB.prepare(
    'UPDATE websites SET name = ?, ignore_status_codes = ?, exclude_patterns = ?, notify_enabled = COALESCE(?, notify_enabled), digest_minutes = COALESCE(?, digest_minutes) WHERE id = ?',
  ).bind(name, ignore, excl, notify ?? null, digest ?? null, site.site.id).run();
  return c.json({ ok: true, site: { id: site.site.id, name, ignore_status_codes: JSON.parse(ignore), exclude_patterns: JSON.parse(excl) } });
});

api.get('/sites/:id/top', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 50);
  const results = await topBrokenUrls(c.env, site.site.id, limit);
  return c.json({ results });
});

api.get('/sites/:id/events', async (c) => {
  const site = await c.env.DB.prepare('SELECT id FROM websites WHERE id = ?').bind(c.req.param('id')).first();
  if (!site) return c.json({ error: 'not found' }, 404);
  const member = await c.env.DB.prepare(
    'SELECT 1 AS ok FROM websites w JOIN team_members tm ON tm.team_id = w.team_id WHERE w.id = ? AND tm.user_id = ?',
  ).bind(c.req.param('id'), c.get('userId')).first();
  if (!member) return c.json({ error: 'forbidden' }, 403);

  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const rows = await c.env.DB.prepare(
    'SELECT id, url, referrer, user_agent, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT ?',
  ).bind(c.req.param('id'), limit).all();
  return c.json({ events: rows.results });
});
