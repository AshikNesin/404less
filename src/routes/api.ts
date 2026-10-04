// Authenticated dashboard API: teams, sites, events. Session-cookie guarded.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { newId, newSiteKey, now, SESSION_COOKIE, verifySession } from '../lib/auth';
import type { Env } from '../types';

export type Vars = { Variables: { userId: string } };
export const api = new Hono<{ Bindings: Env } & Vars>();

api.use('*', async (c, next) => {
  const userId = await verifySession(c.env, getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', userId as never);
  await next();
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
