// Authenticated dashboard API: me, teams, sites. Session-cookie guarded.
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { newId, newSiteKey, now, SESSION_COOKIE, verifySession } from '../lib/auth';
import { sitemap } from './sitemap';
import { channels } from './channels';
import { links } from './links';
import { crawlReport, deleteSite, listEvents, listSitesForUser, siteForUser, siteOverview } from '../server/features/sites/service';
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
api.route('/', channels);  // channels CRUD, alerts history, test-send
api.route('/', links);     // broken-link triage

type Team = { id: string; name: string; owner_user_id: string; created_at: number; role: string };

async function teamsForUser(env: Env, userId: string): Promise<Team[]> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.name, t.owner_user_id, t.created_at, tm.role FROM teams t
     JOIN team_members tm ON tm.team_id = t.id WHERE tm.user_id = ? ORDER BY t.created_at ASC`,
  ).bind(userId).all<Team>();
  return rows.results;
}

// --- me ---

api.get('/me', async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT id, email, created_at FROM users WHERE id = ?').bind(userId).first();
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ user, teams: await teamsForUser(c.env, userId) });
});

// --- teams ---

api.get('/teams', async (c) => c.json({ teams: await teamsForUser(c.env, c.get('userId')) }));

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
  return c.json({ team: { id: teamId, name, owner_user_id: userId, created_at: ts, role: 'owner' } }, 201);
});

// --- sites ---

api.get('/sites', async (c) => c.json({ sites: await listSitesForUser(c.env, c.get('userId')) }));

api.post('/sites', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const domain = typeof body?.domain === 'string' ? body.domain.trim() : '';
  if (!name || !domain) return c.json({ error: 'name and domain required' }, 400);
  const userId = c.get('userId');

  // team: explicit, else the user's first team (created at first sign-in)
  const teams = await teamsForUser(c.env, userId);
  const team = body?.teamId ? teams.find((t) => t.id === body.teamId) : teams[0];
  if (!team) return c.json({ error: 'not a team member' }, 403);
  if (team.role === 'viewer') return c.json({ error: 'viewers cannot create sites' }, 403);

  // site quota (protects self-hoster free-tier limits; default 5)
  const maxSites = Number(c.env.MAX_SITES_PER_TEAM ?? 5);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM websites WHERE team_id = ?').bind(team.id).first<{ n: number }>();
  if (count!.n >= maxSites) return c.json({ error: `site limit reached (max ${maxSites})` }, 402);

  let host: string;
  try {
    const u = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
    host = u.hostname.replace(/^www\./, '') + (u.port ? `:${u.port}` : '');
    if (!host || !/^[a-z0-9.:-]+$/i.test(host)) throw new Error('bad host');
  } catch {
    return c.json({ error: 'invalid domain' }, 400);
  }
  const dup = await c.env.DB.prepare('SELECT id FROM websites WHERE team_id = ? AND domain = ?').bind(team.id, host).first();
  if (dup) return c.json({ error: `${host} is already monitored by this team` }, 409);

  const siteId = newId();
  const siteKey = newSiteKey();
  await c.env.DB.prepare(
    'INSERT INTO websites (id, team_id, name, domain, site_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(siteId, team.id, name, host, siteKey, now()).run();
  return c.json({ site: { id: siteId, team_id: team.id, name, domain: host, site_key: siteKey } }, 201);
});

api.patch('/sites/:id', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === 'viewer') return c.json({ error: 'viewers cannot change settings' }, 403);
  const site = found.site;
  const body = await c.req.json().catch(() => ({}));

  const codes = (v: unknown, fallback: string): string =>
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 100 && x <= 599) ? JSON.stringify([...new Set(v)].slice(0, 50)) : fallback;
  const patterns = (v: unknown, fallback: string): string =>
    Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() && x.length <= 200)
      ? JSON.stringify([...new Set(v.map((x: string) => x.trim()))].slice(0, 100)) : fallback;
  const ignore = body.ignore_status_codes !== undefined ? codes(body.ignore_status_codes, site.ignore_status_codes) : site.ignore_status_codes;
  const excl = body.exclude_patterns !== undefined ? patterns(body.exclude_patterns, site.exclude_patterns) : site.exclude_patterns;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : site.name;
  const notify = typeof body?.notify_enabled === 'boolean' ? (body.notify_enabled ? 1 : 0) : undefined;
  const digest = Number.isInteger(body?.digest_minutes) && body.digest_minutes >= 5 && body.digest_minutes <= 1440
    ? body.digest_minutes : undefined;
  if (body?.digest_minutes !== undefined && digest === undefined) return c.json({ error: 'digest_minutes must be 5..1440' }, 400);
  const crawlEnabled = typeof body?.crawl_enabled === 'boolean' ? (body.crawl_enabled ? 1 : 0) : undefined;
  const crawlMax = Number.isInteger(body?.crawl_max_pages) && body.crawl_max_pages >= 1 && body.crawl_max_pages <= 500
    ? body.crawl_max_pages : undefined;
  if (body?.crawl_max_pages !== undefined && crawlMax === undefined) return c.json({ error: 'crawl_max_pages must be 1..500' }, 400);

  await c.env.DB.prepare(
    `UPDATE websites SET name = ?, ignore_status_codes = ?, exclude_patterns = ?,
     notify_enabled = COALESCE(?, notify_enabled), digest_minutes = COALESCE(?, digest_minutes),
     crawl_enabled = COALESCE(?, crawl_enabled), crawl_max_pages = COALESCE(?, crawl_max_pages)
     WHERE id = ?`,
  ).bind(name, ignore, excl, notify ?? null, digest ?? null, crawlEnabled ?? null, crawlMax ?? null, site.id).run();
  return c.json({ ok: true, site: { id: site.id, name, ignore_status_codes: JSON.parse(ignore), exclude_patterns: JSON.parse(excl) } });
});

api.delete('/sites/:id', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === 'viewer') return c.json({ error: 'viewers cannot delete sites' }, 403);
  await deleteSite(c.env, found.site.id);
  return c.json({ ok: true });
});

// everything the overview page shows
api.get('/sites/:id/overview', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  return c.json(await siteOverview(c.env, found.site));
});

// start a crawl now (manual trigger; same path the cron takes)
api.post('/sites/:id/crawl', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === 'viewer') return c.json({ error: 'forbidden' }, 403);
  await c.env.CRAWLQ.send({ kind: 'crawl-site', siteId: found.site.id, manual: true });
  return c.json({ ok: true, started: true });
});

// latest check per URL from the current run (broken first)
api.get('/sites/:id/crawl-report', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 200);
  const rows = await crawlReport(c.env, found.site, limit);
  return c.json({ results: rows, broken: rows.filter((r) => (r as { ok: number }).ok === 0) });
});

api.get('/sites/:id/events', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  return c.json({ events: await listEvents(c.env, found.site.id, limit) });
});

// CSV export of raw events, or aggregated by url
api.get('/sites/:id/events.csv', async (c) => {
  const found = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const site = found.site;
  const group = c.req.query('group') === 'url';
  const limit = Math.min(Number(c.req.query('limit') ?? 5000), 5000);
  type Row = { url: string; hits?: number; first_seen?: number; last_seen?: number; referrer?: string | null; user_agent?: string | null; ts?: number };
  const rows: { results: Row[] } = group
    ? await c.env.DB.prepare(
        'SELECT url, COUNT(*) AS hits, MIN(ts) AS first_seen, MAX(ts) AS last_seen FROM not_found_events WHERE website_id = ? GROUP BY url ORDER BY hits DESC LIMIT ?',
      ).bind(site.id, limit).all<Row>()
    : await c.env.DB.prepare(
        'SELECT url, referrer, user_agent, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT ?',
      ).bind(site.id, limit).all<Row>();

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
    'Content-Disposition': `attachment; filename="404less-${site.domain}${group ? '-grouped' : ''}.csv"`,
  });
});
