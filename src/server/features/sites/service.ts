// Site-scoped operations shared by routes and future MCP tools.
import type { Env } from '../../../types';
import type { SiteRow } from './helpers';

export * from './helpers';

export async function listSitesForUser(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT w.* FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id
     WHERE tm.user_id = ? ORDER BY w.created_at DESC`,
  ).bind(userId).all<SiteRow>();
  return rows.results.map((r) => ({
    ...r,
    ignore_status_codes: JSON.parse(r.ignore_status_codes ?? '[]'),
    exclude_patterns: JSON.parse(r.exclude_patterns ?? '[]'),
  }));
}

export async function listEvents(env: Env, siteId: string, limit: number) {
  const rows = await env.DB.prepare(
    'SELECT id, url, referrer, user_agent, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT ?',
  ).bind(siteId, limit).all();
  return rows.results;
}

/** Aggregated top broken URLs for a site (dashboard summary). */
export async function topBrokenUrls(env: Env, siteId: string, limit = 10) {
  const rows = await env.DB.prepare(
    `SELECT url, COUNT(*) AS hits, MAX(ts) AS last_seen FROM not_found_events
     WHERE website_id = ? GROUP BY url ORDER BY hits DESC LIMIT ?`,
  ).bind(siteId, limit).all();
  return rows.results;
}
