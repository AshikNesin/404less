// MCP tool implementations (read-only), shared by the streamable-HTTP endpoint.
// All tools scope strictly to the authenticated team's sites.
import type { Env } from '../../../types';
import { rankSuggestions } from '../../../lib/suggest';

export type TeamSite = { id: string; name: string; domain: string; site_key: string };

export async function teamSites(env: Env, teamId: string): Promise<TeamSite[]> {
  const rows = await env.DB.prepare(
    `SELECT w.id, w.name, w.domain, w.site_key FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id WHERE tm.team_id = ?`,
  ).bind(teamId).all<TeamSite>();
  return rows.results;
}

async function resolveSite(env: Env, teamId: string, site: string): Promise<TeamSite | null> {
  // accept site id, domain, or name (case-insensitive)
  const sites = await teamSites(env, teamId);
  const s = site.toLowerCase();
  return sites.find((x) => x.id === site || x.domain.toLowerCase() === s || x.name.toLowerCase() === s) ?? null;
}

export async function listBrokenLinks(env: Env, teamId: string, args: {
  site: string; status?: number; since?: string; limit?: number;
}) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const limit = Math.min(args.limit ?? 50, 200);
  const sinceMs = args.since ? Date.parse(args.since) : null;

  let sql = `SELECT url, COUNT(*) AS hits, MAX(ts) AS last_seen, MIN(ts) AS first_seen
             FROM not_found_events WHERE website_id = ?`;
  const binds: unknown[] = [st.id];
  if (sinceMs) { sql += ' AND ts >= ?'; binds.push(sinceMs); }
  sql += ' GROUP BY url ORDER BY hits DESC LIMIT ?';
  binds.push(limit);
  const rows = await env.DB.prepare(sql).bind(...binds).all<{ url: string; hits: number; last_seen: number; first_seen: number }>();
  return {
    site: st.domain,
    broken_links: rows.results.map((r) => ({
      url: r.url,
      hits: r.hits,
      first_seen: new Date(r.first_seen).toISOString(),
      last_seen: new Date(r.last_seen).toISOString(),
    })),
  };
}

export async function getSuggestions(env: Env, teamId: string, args: { site: string; url: string }) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const known = await env.DB.prepare(
    'SELECT url, title FROM known_urls WHERE website_id = ? LIMIT 5000',
  ).bind(st.id).all<{ url: string; title: string | null }>();
  return { site: st.domain, suggestions: rankSuggestions(args.url, known.results) };
}

export async function listSites(env: Env, teamId: string) {
  const sites = await teamSites(env, teamId);
  return { sites: sites.map((s) => ({ id: s.id, name: s.name, domain: s.domain })) };
}

export async function getLinkDetails(env: Env, teamId: string, args: { site: string; url: string }) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const grouped = await env.DB.prepare(
    `SELECT COUNT(*) AS hits, MIN(ts) AS first_seen, MAX(ts) AS last_seen
     FROM not_found_events WHERE website_id = ? AND url = ?`,
  ).bind(st.id, args.url).first<{ hits: number; first_seen: number; last_seen: number }>();
  const referrers = await env.DB.prepare(
    `SELECT referrer, COUNT(*) AS n FROM not_found_events
     WHERE website_id = ? AND url = ? AND referrer IS NOT NULL
     GROUP BY referrer ORDER BY n DESC LIMIT 10`,
  ).bind(st.id, args.url).all<{ referrer: string; n: number }>();
  const known = await env.DB.prepare(
    'SELECT url, title FROM known_urls WHERE website_id = ? LIMIT 5000',
  ).bind(st.id).all<{ url: string; title: string | null }>();
  return {
    site: st.domain,
    url: args.url,
    hits: grouped?.hits ?? 0,
    first_seen: grouped?.first_seen ? new Date(grouped.first_seen).toISOString() : null,
    last_seen: grouped?.last_seen ? new Date(grouped.last_seen).toISOString() : null,
    top_referrers: referrers.results,
    suggested_fixes: rankSuggestions(args.url, known.results),
  };
}
