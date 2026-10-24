// MCP tool implementations (read-only), shared by the streamable-HTTP endpoint.
// All tools scope strictly to the authenticated team's sites.
import type { Env } from '../../../types';
import { LINK_STATUSES, suggestFor, type LinkStatus } from '../links/service';

export type TeamSite = { id: string; name: string; domain: string; site_key: string };

export async function teamSites(env: Env, teamId: string): Promise<TeamSite[]> {
  const rows = await env.DB.prepare(
    'SELECT id, name, domain, site_key FROM websites WHERE team_id = ? ORDER BY created_at ASC',
  ).bind(teamId).all<TeamSite>();
  return rows.results;
}

async function resolveSite(env: Env, teamId: string, site: string): Promise<TeamSite | null> {
  // accept site id, domain, or name (case-insensitive)
  const sites = await teamSites(env, teamId);
  const s = site.toLowerCase();
  return sites.find((x) => x.id === site || x.domain.toLowerCase() === s || x.name.toLowerCase() === s) ?? null;
}

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);

export async function listBrokenLinks(env: Env, teamId: string, args: {
  site: string; status?: string; since?: string; limit?: number;
}) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const limit = Math.min(args.limit ?? 50, 200);
  const status: LinkStatus | 'all' = (LINK_STATUSES as readonly string[]).includes(args.status ?? '') ? (args.status as LinkStatus) : args.status === 'all' ? 'all' : 'open';
  const sinceMs = args.since ? Date.parse(args.since) : NaN;

  let sql = `SELECT url, status, source, hits, http_status, first_seen, last_seen, suggested_url, suggested_title
             FROM broken_links WHERE website_id = ?`;
  const binds: unknown[] = [st.id];
  if (status !== 'all') { sql += ' AND status = ?'; binds.push(status); }
  if (!Number.isNaN(sinceMs)) { sql += ' AND last_seen >= ?'; binds.push(sinceMs); }
  sql += ' ORDER BY hits DESC, last_seen DESC LIMIT ?';
  binds.push(limit);
  const rows = await env.DB.prepare(sql).bind(...binds).all<{
    url: string; status: string; source: string; hits: number; http_status: number | null;
    first_seen: number; last_seen: number; suggested_url: string | null; suggested_title: string | null;
  }>();
  return {
    site: st.domain,
    status,
    broken_links: rows.results.map((r) => ({
      url: r.url,
      status: r.status,
      detected_by: r.source,
      hits: r.hits,
      http_status: r.http_status,
      first_seen: iso(r.first_seen),
      last_seen: iso(r.last_seen),
      suggested_fix: r.suggested_url ? { url: r.suggested_url, title: r.suggested_title } : null,
    })),
  };
}

export async function getSuggestions(env: Env, teamId: string, args: { site: string; url: string }) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  return { site: st.domain, suggestions: await suggestFor(env, st.id, args.url, 5) };
}

export async function listSites(env: Env, teamId: string) {
  const sites = await teamSites(env, teamId);
  if (!sites.length) return { sites: [] };
  const counts = await env.DB.prepare(
    `SELECT website_id, COUNT(*) AS n FROM broken_links WHERE status = 'open' AND website_id IN (${sites.map(() => '?').join(',')}) GROUP BY website_id`,
  ).bind(...sites.map((s) => s.id)).all<{ website_id: string; n: number }>();
  const open = new Map(counts.results.map((r) => [r.website_id, r.n]));
  return { sites: sites.map((s) => ({ id: s.id, name: s.name, domain: s.domain, open_broken_links: open.get(s.id) ?? 0 })) };
}

export async function getLinkDetails(env: Env, teamId: string, args: { site: string; url: string }) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const link = await env.DB.prepare('SELECT * FROM broken_links WHERE website_id = ? AND url = ?').bind(st.id, args.url)
    .first<{ status: string; source: string; hits: number; http_status: number | null; first_seen: number; last_seen: number; resolved_at: number | null }>();
  const [referrers, sources, check] = await env.DB.batch([
    env.DB.prepare(
      `SELECT referrer, COUNT(*) AS n FROM not_found_events
       WHERE website_id = ? AND url = ? AND referrer IS NOT NULL
       GROUP BY referrer ORDER BY n DESC LIMIT 10`,
    ).bind(st.id, args.url),
    env.DB.prepare('SELECT source_url, anchor FROM crawl_sources WHERE website_id = ? AND target_url = ? LIMIT 25').bind(st.id, args.url),
    env.DB.prepare('SELECT status, redirect_chain, checked_at FROM link_checks WHERE website_id = ? AND url = ? ORDER BY checked_at DESC LIMIT 1').bind(st.id, args.url),
  ]);
  const lastCheck = check.results[0] as { status: number; redirect_chain: string | null; checked_at: number } | undefined;
  return {
    site: st.domain,
    url: args.url,
    status: link?.status ?? null,
    detected_by: link?.source ?? null,
    hits: link?.hits ?? 0,
    http_status: link?.http_status ?? null,
    first_seen: iso(link?.first_seen),
    last_seen: iso(link?.last_seen),
    resolved_at: iso(link?.resolved_at),
    last_check: lastCheck ? { status: lastCheck.status, checked_at: iso(lastCheck.checked_at), redirect_chain: lastCheck.redirect_chain ? JSON.parse(lastCheck.redirect_chain) : null } : null,
    top_referrers: referrers.results,
    found_on_pages: sources.results,
    suggested_fixes: await suggestFor(env, st.id, args.url, 5),
  };
}
