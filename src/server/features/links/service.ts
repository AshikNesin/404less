// Broken links: the one list the dashboard manages. Both detectors feed it —
// visitor 404 hits (embed → /api/track) and crawler link checks — and the user
// triages rows between open / resolved / ignored. The crawler also resolves
// and reopens rows on its own as URLs come back or break again.
import type { Env } from '../../../types';
import { prepareKnown, rankPrepared, type PreparedKnown, type Suggestion } from '../../../lib/suggest';
import { checkUrl } from '../crawl/checker';
import type { SiteRow } from '../sites/helpers';

export type LinkStatus = 'open' | 'resolved' | 'ignored';
export type LinkSource = 'visitor' | 'crawler' | 'both';
export const LINK_STATUSES: readonly LinkStatus[] = ['open', 'resolved', 'ignored'];

export type BrokenLinkRow = {
  id: string;
  website_id: string;
  url: string;
  status: LinkStatus;
  source: LinkSource;
  hits: number;
  http_status: number | null;
  first_seen: number;
  last_seen: number;
  resolved_at: number | null;
  suggested_url: string | null;
  suggested_title: string | null;
};

export type ListRow = BrokenLinkRow & { source_pages: number; found_on: string | null };

export type ListQuery = {
  status: LinkStatus | 'all';
  source?: 'visitor' | 'crawler';
  q?: string;
  sort: 'hits' | 'last_seen' | 'first_seen';
  page: number;
  limit: number;
};

const KNOWN_LIMIT = 5000;
const KNOWN_TTL_MS = 5 * 60 * 1000;
// Per-isolate cache of the prepared known-URL index: hot sites skip re-tokenizing
// thousands of URLs on every 404 hit. Falls out after a few minutes.
const knownCache = new Map<string, { at: number; prepared: PreparedKnown }>();

export function invalidateKnownUrls(siteId: string): void {
  knownCache.delete(siteId);
}

async function knownIndex(env: Env, siteId: string): Promise<PreparedKnown> {
  const hit = knownCache.get(siteId);
  if (hit && Date.now() - hit.at < KNOWN_TTL_MS) return hit.prepared;
  const rows = await env.DB.prepare('SELECT url, title FROM known_urls WHERE website_id = ? LIMIT ?')
    .bind(siteId, KNOWN_LIMIT).all<{ url: string; title: string | null }>();
  const prepared = prepareKnown(rows.results);
  knownCache.set(siteId, { at: Date.now(), prepared });
  return prepared;
}

/** Ranked replacement candidates for a broken URL (same engine as the embed + MCP). */
export async function suggestFor(env: Env, siteId: string, url: string, limit = 3): Promise<Suggestion[]> {
  return rankPrepared(url, await knownIndex(env, siteId), limit);
}

async function findByUrl(env: Env, siteId: string, url: string) {
  return env.DB.prepare('SELECT id, status, source FROM broken_links WHERE website_id = ? AND url = ?')
    .bind(siteId, url).first<{ id: string; status: LinkStatus; source: LinkSource }>();
}

async function insertLink(env: Env, siteId: string, url: string, source: LinkSource, ts: number, httpStatus: number | null, hits: number) {
  const id = crypto.randomUUID();
  const [best] = await suggestFor(env, siteId, url, 1);
  await env.DB.prepare(
    `INSERT INTO broken_links (id, website_id, url, status, source, hits, http_status, first_seen, last_seen, suggested_url, suggested_title)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, siteId, url, source, hits, httpStatus, ts, ts, best?.url ?? null, best?.title ?? null).run();
  return id;
}

export type HitOutcome = { id: string; status: LinkStatus; isNew: boolean; reopened: boolean };

/** A visitor hit the URL: count it, open/reopen the row. Ignored rows stay ignored. */
export async function recordVisitorHit(env: Env, siteId: string, url: string, ts: number): Promise<HitOutcome> {
  const prev = await findByUrl(env, siteId, url);
  if (!prev) {
    const id = await insertLink(env, siteId, url, 'visitor', ts, null, 1);
    return { id, status: 'open', isNew: true, reopened: false };
  }
  const reopened = prev.status === 'resolved';
  const status: LinkStatus = reopened ? 'open' : prev.status;
  await env.DB.prepare(
    `UPDATE broken_links SET hits = hits + 1, last_seen = ?, status = ?,
       source = CASE WHEN source = 'crawler' THEN 'both' ELSE source END,
       resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE resolved_at END
     WHERE id = ?`,
  ).bind(ts, status, status, prev.id).run();
  return { id: prev.id, status, isNew: false, reopened };
}

export type CheckOutcome = { alert: boolean; status: LinkStatus | null };

/** The crawler checked the URL: a failure opens/reopens the row, a success resolves it. */
export async function recordCrawlResult(
  env: Env, siteId: string, url: string, result: { status: number; ok: boolean }, ts: number,
): Promise<CheckOutcome> {
  const prev = await findByUrl(env, siteId, url);
  if (result.ok) {
    if (!prev) return { alert: false, status: null };
    const status: LinkStatus = prev.status === 'open' ? 'resolved' : prev.status;
    await env.DB.prepare(
      'UPDATE broken_links SET http_status = ?, status = ?, resolved_at = CASE WHEN ? = ? THEN ? ELSE resolved_at END WHERE id = ?',
    ).bind(result.status, status, status, prev.status, ts, prev.id).run();
    return { alert: false, status };
  }
  if (!prev) {
    await insertLink(env, siteId, url, 'crawler', ts, result.status, 0);
    return { alert: true, status: 'open' };
  }
  const reopened = prev.status === 'resolved';
  const status: LinkStatus = reopened ? 'open' : prev.status;
  await env.DB.prepare(
    `UPDATE broken_links SET http_status = ?, last_seen = ?, status = ?,
       source = CASE WHEN source = 'visitor' THEN 'both' ELSE source END,
       resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE resolved_at END
     WHERE id = ?`,
  ).bind(result.status, ts, status, status, prev.id).run();
  return { alert: reopened, status };
}

export async function listLinks(env: Env, siteId: string, q: ListQuery) {
  const where = ['bl.website_id = ?'];
  const binds: unknown[] = [siteId];
  if (q.status !== 'all') { where.push('bl.status = ?'); binds.push(q.status); }
  if (q.source === 'visitor') where.push("bl.source IN ('visitor','both')");
  if (q.source === 'crawler') where.push("bl.source IN ('crawler','both')");
  if (q.q) { where.push('instr(lower(bl.url), ?) > 0'); binds.push(q.q.toLowerCase()); }
  const order = q.sort === 'hits' ? 'bl.hits DESC, bl.last_seen DESC'
    : q.sort === 'first_seen' ? 'bl.first_seen DESC' : 'bl.last_seen DESC';
  const w = where.join(' AND ');

  const [rows, total, counts] = await env.DB.batch([
    env.DB.prepare(
      `SELECT bl.*,
         (SELECT COUNT(*) FROM crawl_sources cs WHERE cs.website_id = bl.website_id AND cs.target_url = bl.url) AS source_pages,
         (SELECT cs.source_url FROM crawl_sources cs WHERE cs.website_id = bl.website_id AND cs.target_url = bl.url LIMIT 1) AS found_on
       FROM broken_links bl WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...binds, q.limit, (q.page - 1) * q.limit),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM broken_links bl WHERE ${w}`).bind(...binds),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM broken_links WHERE website_id = ? GROUP BY status').bind(siteId),
  ]);
  const byStatus: Record<LinkStatus, number> = { open: 0, resolved: 0, ignored: 0 };
  for (const r of counts.results as { status: LinkStatus; n: number }[]) byStatus[r.status] = r.n;
  return {
    links: rows.results as ListRow[],
    total: (total.results[0] as { n: number }).n,
    counts: byStatus,
    page: q.page,
    limit: q.limit,
  };
}

export type DaySeries = { day: string; hits: number }[];

/** Daily buckets for the last N days (UTC), zero-filled, oldest first. */
export function fillDays(rows: { day: number; n: number }[], days: number, now = Date.now()): DaySeries {
  const today = Math.floor(now / 86_400_000);
  const map = new Map(rows.map((r) => [r.day, r.n]));
  const out: DaySeries = [];
  for (let d = today - days + 1; d <= today; d++) {
    out.push({ day: new Date(d * 86_400_000).toISOString().slice(0, 10), hits: map.get(d) ?? 0 });
  }
  return out;
}

export async function getLink(env: Env, siteId: string, linkId: string) {
  const link = await env.DB.prepare('SELECT * FROM broken_links WHERE id = ? AND website_id = ?')
    .bind(linkId, siteId).first<BrokenLinkRow>();
  if (!link) return null;
  const since = Date.now() - 30 * 86_400_000;
  const [referrers, sources, lastCheck, series, recent] = await env.DB.batch([
    env.DB.prepare(
      `SELECT referrer, COUNT(*) AS n FROM not_found_events
       WHERE website_id = ? AND url = ? AND referrer IS NOT NULL AND referrer != ''
       GROUP BY referrer ORDER BY n DESC LIMIT 10`,
    ).bind(siteId, link.url),
    env.DB.prepare('SELECT source_url, anchor FROM crawl_sources WHERE website_id = ? AND target_url = ? LIMIT 25').bind(siteId, link.url),
    env.DB.prepare('SELECT status, redirect_chain, checked_at FROM link_checks WHERE website_id = ? AND url = ? ORDER BY checked_at DESC LIMIT 1').bind(siteId, link.url),
    env.DB.prepare(
      `SELECT CAST(ts / 86400000 AS INTEGER) AS day, COUNT(*) AS n FROM not_found_events
       WHERE website_id = ? AND url = ? AND ts >= ? GROUP BY day`,
    ).bind(siteId, link.url, since),
    env.DB.prepare('SELECT referrer, user_agent, ts FROM not_found_events WHERE website_id = ? AND url = ? ORDER BY ts DESC LIMIT 10').bind(siteId, link.url),
  ]);
  const suggestions = await suggestFor(env, siteId, link.url, 5);
  const best = suggestions[0];
  if (best && best.url !== link.suggested_url) {
    await env.DB.prepare('UPDATE broken_links SET suggested_url = ?, suggested_title = ? WHERE id = ?')
      .bind(best.url, best.title, link.id).run();
    link.suggested_url = best.url;
    link.suggested_title = best.title;
  }
  const check = lastCheck.results[0] as { status: number; redirect_chain: string | null; checked_at: number } | undefined;
  let chain: { url: string; status: number }[] | null = null;
  try { chain = check?.redirect_chain ? JSON.parse(check.redirect_chain) : null; } catch {}
  return {
    link,
    suggestions,
    referrers: referrers.results as { referrer: string; n: number }[],
    sources: sources.results as { source_url: string; anchor: string | null }[],
    lastCheck: check ? { status: check.status, checkedAt: check.checked_at, chain } : null,
    series: fillDays(series.results as { day: number; n: number }[], 30),
    recent: recent.results as { referrer: string | null; user_agent: string | null; ts: number }[],
  };
}

export async function setLinkStatus(env: Env, siteId: string, ids: string[], status: LinkStatus): Promise<number> {
  if (!ids.length) return 0;
  const marks = ids.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `UPDATE broken_links SET status = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE NULL END
     WHERE website_id = ? AND id IN (${marks})`,
  ).bind(status, status, Date.now(), siteId, ...ids).run();
  return res.meta.changes ?? 0;
}

/** Fetch the URL now and apply the result like a crawl check would. */
export async function recheckLink(env: Env, site: Pick<SiteRow, 'id' | 'ignore_status_codes'>, linkId: string) {
  const link = await env.DB.prepare('SELECT id, url FROM broken_links WHERE id = ? AND website_id = ?')
    .bind(linkId, site.id).first<{ id: string; url: string }>();
  if (!link) return null;
  const result = await checkUrl(link.url, site);
  const ts = Date.now();
  await env.DB.prepare(
    'INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), site.id, link.url, result.status, result.ok ? 1 : 0, result.redirectChain ? JSON.stringify(result.redirectChain) : null, ts).run();
  const outcome = await recordCrawlResult(env, site.id, link.url, result, ts);
  return { httpStatus: result.status, ok: result.ok, status: outcome.status, chain: result.redirectChain };
}

/** Recompute stored suggestions for the most-hit open links (after a sitemap import). */
export async function refreshSuggestions(env: Env, siteId: string, limit = 10): Promise<void> {
  invalidateKnownUrls(siteId);
  const rows = await env.DB.prepare(
    "SELECT id, url FROM broken_links WHERE website_id = ? AND status = 'open' ORDER BY hits DESC, last_seen DESC LIMIT ?",
  ).bind(siteId, limit).all<{ id: string; url: string }>();
  if (!rows.results.length) return;
  const index = await knownIndex(env, siteId);
  const stmts = rows.results.map((r) => {
    const [best] = rankPrepared(r.url, index, 1);
    return env.DB.prepare('UPDATE broken_links SET suggested_url = ?, suggested_title = ? WHERE id = ?')
      .bind(best?.url ?? null, best?.title ?? null, r.id);
  });
  await env.DB.batch(stmts);
}

/** URLs the crawler should verify at the start of a run: open links visitors reported. */
export async function openVisitorLinks(env: Env, siteId: string, limit = 100): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT url FROM broken_links WHERE website_id = ? AND status = 'open' ORDER BY hits DESC LIMIT ?",
  ).bind(siteId, limit).all<{ url: string }>();
  return rows.results.map((r) => r.url);
}
