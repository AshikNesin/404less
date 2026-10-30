// Site-scoped operations shared by routes and MCP tools.
import type { Env } from '../../../types';
import { fillDays, type LinkStatus } from '../links/service';
import type { SiteRow } from './helpers';

export * from './helpers';

const DAY = 86_400_000;
// A crawl is "running" while checks keep landing; the queue has no end signal. Before the
// first check, allow for the queue to start and the first pages to load.
const CRAWL_START_WINDOW_MS = 90_000;
const CRAWL_IDLE_WINDOW_MS = 45_000;

export type SiteSummary = Omit<SiteRow, 'ignore_status_codes' | 'exclude_patterns'> & {
  ignore_status_codes: number[];
  exclude_patterns: string[];
  open_links: number;
  hits_7d: number;
  last_hit_at: number | null;
};

/** Sites the user can see, each with the headline numbers the sidebar + overview list need. */
export async function listSitesForUser(env: Env, userId: string): Promise<SiteSummary[]> {
  const since = Date.now() - 7 * DAY;
  const rows = await env.DB.prepare(
    `SELECT w.*,
       (SELECT COUNT(*) FROM broken_links bl WHERE bl.website_id = w.id AND bl.status = 'open') AS open_links,
       (SELECT COUNT(*) FROM not_found_events e WHERE e.website_id = w.id AND e.ts >= ?) AS hits_7d,
       (SELECT MAX(ts) FROM not_found_events e WHERE e.website_id = w.id) AS last_hit_at
     FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id
     WHERE tm.user_id = ? ORDER BY w.created_at ASC`,
  ).bind(since, userId).all<SiteRow & { open_links: number; hits_7d: number; last_hit_at: number | null }>();
  return rows.results.map((r) => ({
    ...r,
    ignore_status_codes: parseJsonArray<number>(r.ignore_status_codes),
    exclude_patterns: parseJsonArray<string>(r.exclude_patterns),
  }));
}

function parseJsonArray<T>(s: unknown): T[] {
  try {
    const v = JSON.parse(typeof s === 'string' ? s : '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function listEvents(env: Env, siteId: string, limit: number) {
  const rows = await env.DB.prepare(
    'SELECT id, url, referrer, user_agent, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT ?',
  ).bind(siteId, limit).all();
  return rows.results;
}

/** Everything the site overview page shows, in one round trip. */
export async function siteOverview(env: Env, site: SiteRow & { team_id: string; last_crawl_at?: number | null }) {
  const now = Date.now();
  const since30 = now - 30 * DAY;
  const since7 = now - 7 * DAY;
  const since14 = now - 14 * DAY;
  const crawlSince = site.last_crawl_at ?? 0;
  const [counts, series, hits7, hits14, top, recent, crawl, known, channels] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM broken_links WHERE website_id = ? GROUP BY status').bind(site.id),
    env.DB.prepare(
      `SELECT CAST(ts / 86400000 AS INTEGER) AS day, COUNT(*) AS n FROM not_found_events
       WHERE website_id = ? AND ts >= ? GROUP BY day`,
    ).bind(site.id, since30),
    env.DB.prepare('SELECT COUNT(*) AS n FROM not_found_events WHERE website_id = ? AND ts >= ?').bind(site.id, since7),
    env.DB.prepare('SELECT COUNT(*) AS n FROM not_found_events WHERE website_id = ? AND ts >= ? AND ts < ?').bind(site.id, since14, since7),
    env.DB.prepare(
      `SELECT id, url, source, hits, http_status, last_seen, title, suggested_url, suggested_title,
         (SELECT COUNT(*) FROM crawl_sources cs WHERE cs.website_id = bl.website_id AND cs.target_url = bl.url) AS source_pages
       FROM broken_links bl WHERE website_id = ? AND status = 'open'
       ORDER BY hits DESC, last_seen DESC LIMIT 6`,
    ).bind(site.id),
    env.DB.prepare('SELECT id, url, referrer, ts FROM not_found_events WHERE website_id = ? ORDER BY ts DESC LIMIT 8').bind(site.id),
    env.DB.prepare(
      // one row per URL, its latest check (SQLite returns the bare ok from the MAX row), like crawlReport
      `SELECT COUNT(*) AS checked, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS broken, MAX(at) AS last_check_at
       FROM (SELECT ok, MAX(checked_at) AS at FROM link_checks WHERE website_id = ? AND checked_at >= ? GROUP BY url)`,
    ).bind(site.id, crawlSince),
    env.DB.prepare('SELECT COUNT(*) AS n FROM known_urls WHERE website_id = ?').bind(site.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM alert_channels WHERE team_id = ? AND enabled = 1').bind(site.team_id),
  ]);
  const byStatus: Record<LinkStatus, number> = { open: 0, resolved: 0, ignored: 0 };
  for (const r of counts.results as { status: LinkStatus; n: number }[]) byStatus[r.status] = r.n;
  const c = crawl.results[0] as { checked: number; broken: number | null; last_check_at: number | null };
  const lastCheckAt = c.last_check_at ?? null;
  const running = !!site.last_crawl_at && (
    lastCheckAt ? now - lastCheckAt < CRAWL_IDLE_WINDOW_MS : now - site.last_crawl_at < CRAWL_START_WINDOW_MS
  );
  return {
    counts: byStatus,
    series: fillDays(series.results as { day: number; n: number }[], 30, now),
    hits7d: (hits7.results[0] as { n: number }).n,
    hitsPrev7d: (hits14.results[0] as { n: number }).n,
    topOpen: top.results,
    recent: recent.results,
    crawl: {
      lastCrawlAt: site.last_crawl_at ?? null,
      lastCheckAt,
      checked: site.last_crawl_at ? c.checked : 0,
      broken: site.last_crawl_at ? (c.broken ?? 0) : 0,
      running,
    },
    knownUrls: (known.results[0] as { n: number }).n,
    channels: (channels.results[0] as { n: number }).n,
  };
}

/** Latest crawl results for the crawler page: one row per URL from the current run. */
export async function crawlReport(env: Env, site: SiteRow & { last_crawl_at?: number | null }, limit: number) {
  const since = site.last_crawl_at ?? 0;
  const rows = await env.DB.prepare(
    `SELECT lc.url, lc.status, lc.ok, lc.redirect_chain, lc.checked_at, bl.id AS link_id, bl.status AS link_status,
       (SELECT cs.source_url FROM crawl_sources cs WHERE cs.website_id = lc.website_id AND cs.target_url = lc.url LIMIT 1) AS found_on,
       (SELECT cs.source_title FROM crawl_sources cs WHERE cs.website_id = lc.website_id AND cs.target_url = lc.url LIMIT 1) AS found_on_title
     FROM link_checks lc
     JOIN (SELECT url, MAX(checked_at) AS m FROM link_checks WHERE website_id = ? AND checked_at >= ? GROUP BY url) latest
       ON latest.url = lc.url AND latest.m = lc.checked_at
     LEFT JOIN broken_links bl ON bl.website_id = lc.website_id AND bl.url = lc.url
     WHERE lc.website_id = ? AND lc.checked_at >= ?
     ORDER BY lc.ok ASC, lc.checked_at DESC LIMIT ?`,
  ).bind(site.id, since, site.id, since, limit).all();
  return rows.results;
}

/** Remove a site and everything recorded for it. */
export async function deleteSite(env: Env, siteId: string): Promise<void> {
  const tables = ['not_found_events', 'known_urls', 'link_checks', 'crawl_sources', 'broken_links', 'alerts'];
  await env.DB.batch([
    ...tables.map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE website_id = ?`).bind(siteId)),
    env.DB.prepare('DELETE FROM websites WHERE id = ?').bind(siteId),
  ]);
}
