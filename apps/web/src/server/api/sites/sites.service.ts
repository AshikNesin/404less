// Site-scoped operations shared by routes and MCP tools.
import type { Env } from "../../types";
import { fillDays, type LinkStatus } from "../links/links.service";
import type { SiteRow } from "./sites.helpers";
import { and, asc, count, desc, eq, getTableColumns, gte, lt, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  alertChannels,
  alerts,
  batch,
  brokenLinks,
  crawlSources,
  db,
  knownUrls,
  linkChecks,
  notFoundEvents,
  teamMembers,
  websites,
} from "../../db";

export * from "./sites.helpers";

const DAY = 86_400_000;
// A crawl is "running" while checks keep landing; the queue has no end signal. Before the
// first check, allow for the queue to start and the first pages to load.
const CRAWL_START_WINDOW_MS = 90_000;
const CRAWL_IDLE_WINDOW_MS = 45_000;

export type SiteSummary = Omit<SiteRow, "ignore_status_codes" | "exclude_patterns"> & {
  ignore_status_codes: number[];
  exclude_patterns: string[];
  open_links: number;
  hits_7d: number;
  last_hit_at: number | null;
};

/** Sites the user can see, each with the headline numbers the sidebar + overview list need. */
export async function listSitesForUser(env: Env, userId: string): Promise<SiteSummary[]> {
  const since = Date.now() - 7 * DAY;
  const rows = await db
    .select({
      ...getTableColumns(websites),
      open_links: sql<number>`(SELECT COUNT(*) FROM ${brokenLinks} WHERE ${brokenLinks.website_id} = ${websites.id} AND ${brokenLinks.status} = 'open')`,
      hits_7d: sql<number>`(SELECT COUNT(*) FROM ${notFoundEvents} WHERE ${notFoundEvents.website_id} = ${websites.id} AND ${notFoundEvents.ts} >= ${since})`,
      last_hit_at: sql<
        number | null
      >`(SELECT MAX(${notFoundEvents.ts}) FROM ${notFoundEvents} WHERE ${notFoundEvents.website_id} = ${websites.id})`,
    })
    .from(websites)
    .innerJoin(teamMembers, eq(teamMembers.team_id, websites.team_id))
    .where(eq(teamMembers.user_id, userId))
    .orderBy(asc(websites.created_at));
  return rows.map((r) => ({
    ...r,
    ignore_status_codes: parseJsonArray<number>(r.ignore_status_codes),
    exclude_patterns: parseJsonArray<string>(r.exclude_patterns),
  }));
}

function parseJsonArray<T>(s: unknown): T[] {
  try {
    const v = JSON.parse(typeof s === "string" ? s : "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function listEvents(env: Env, siteId: string, limit: number) {
  return db
    .select({
      id: notFoundEvents.id,
      url: notFoundEvents.url,
      referrer: notFoundEvents.referrer,
      user_agent: notFoundEvents.user_agent,
      ts: notFoundEvents.ts,
    })
    .from(notFoundEvents)
    .where(eq(notFoundEvents.website_id, siteId))
    .orderBy(desc(notFoundEvents.ts))
    .limit(limit);
}

/** Everything the site overview page shows, in one round trip. */
export async function siteOverview(
  env: Env,
  site: SiteRow & { team_id: string; last_crawl_at?: number | null },
) {
  const now = Date.now();
  const since30 = now - 30 * DAY;
  const since7 = now - 7 * DAY;
  const since14 = now - 14 * DAY;
  const crawlSince = site.last_crawl_at ?? 0;
  const day = sql<number>`CAST(${notFoundEvents.ts} / 86400000 AS INTEGER)`;
  const events = eq(notFoundEvents.website_id, site.id);
  // one row per URL, its latest check (SQLite returns the bare ok from the MAX row), like crawlReport
  const latest = db
    .select({ ok: linkChecks.ok, at: max(linkChecks.checked_at).as("at") })
    .from(linkChecks)
    .where(and(eq(linkChecks.website_id, site.id), gte(linkChecks.checked_at, crawlSince)))
    .groupBy(linkChecks.url)
    .as("latest");
  const [counts, series, hits7, hits14, top, recent, crawl, known, channels] = await batch([
    db
      .select({ status: brokenLinks.status, n: count() })
      .from(brokenLinks)
      .where(eq(brokenLinks.website_id, site.id))
      .groupBy(brokenLinks.status),
    db
      .select({ day, n: count() })
      .from(notFoundEvents)
      .where(and(events, gte(notFoundEvents.ts, since30)))
      .groupBy(day),
    db
      .select({ n: count() })
      .from(notFoundEvents)
      .where(and(events, gte(notFoundEvents.ts, since7))),
    db
      .select({ n: count() })
      .from(notFoundEvents)
      .where(and(events, gte(notFoundEvents.ts, since14), lt(notFoundEvents.ts, since7))),
    db
      .select({
        id: brokenLinks.id,
        url: brokenLinks.url,
        source: brokenLinks.source,
        hits: brokenLinks.hits,
        http_status: brokenLinks.http_status,
        last_seen: brokenLinks.last_seen,
        title: brokenLinks.title,
        suggested_url: brokenLinks.suggested_url,
        suggested_title: brokenLinks.suggested_title,
        source_pages: sql<number>`(SELECT COUNT(*) FROM ${crawlSources} WHERE ${crawlSources.website_id} = ${brokenLinks.website_id} AND ${crawlSources.target_url} = ${brokenLinks.url})`,
      })
      .from(brokenLinks)
      .where(and(eq(brokenLinks.website_id, site.id), eq(brokenLinks.status, "open")))
      .orderBy(desc(brokenLinks.hits), desc(brokenLinks.last_seen))
      .limit(6),
    db
      .select({
        id: notFoundEvents.id,
        url: notFoundEvents.url,
        referrer: notFoundEvents.referrer,
        ts: notFoundEvents.ts,
      })
      .from(notFoundEvents)
      .where(events)
      .orderBy(desc(notFoundEvents.ts))
      .limit(8),
    db
      .select({
        checked: count(),
        broken: sql<number | null>`SUM(CASE WHEN ${latest.ok} = 0 THEN 1 ELSE 0 END)`,
        last_check_at: sql<number | null>`MAX(${latest.at})`,
      })
      .from(latest),
    db.select({ n: count() }).from(knownUrls).where(eq(knownUrls.website_id, site.id)),
    db
      .select({ n: count() })
      .from(alertChannels)
      .where(and(eq(alertChannels.team_id, site.team_id), eq(alertChannels.enabled, 1))),
  ]);
  const byStatus: Record<LinkStatus, number> = { open: 0, resolved: 0, ignored: 0 };
  for (const r of counts) byStatus[r.status as LinkStatus] = r.n;
  const c = crawl[0];
  const lastCheckAt = c.last_check_at ?? null;
  const running =
    !!site.last_crawl_at &&
    (lastCheckAt
      ? now - lastCheckAt < CRAWL_IDLE_WINDOW_MS
      : now - site.last_crawl_at < CRAWL_START_WINDOW_MS);
  return {
    counts: byStatus,
    series: fillDays(series, 30, now),
    hits7d: hits7[0].n,
    hitsPrev7d: hits14[0].n,
    topOpen: top,
    recent,
    crawl: {
      lastCrawlAt: site.last_crawl_at ?? null,
      lastCheckAt,
      checked: site.last_crawl_at ? c.checked : 0,
      broken: site.last_crawl_at ? (c.broken ?? 0) : 0,
      running,
    },
    knownUrls: known[0].n,
    channels: channels[0].n,
  };
}

/** Latest crawl results for the crawler page: one row per URL from the current run. */
export async function crawlReport(
  env: Env,
  site: SiteRow & { last_crawl_at?: number | null },
  limit: number,
) {
  const since = site.last_crawl_at ?? 0;
  const lc = alias(linkChecks, "lc");
  const latest = db
    .select({ url: linkChecks.url, m: max(linkChecks.checked_at).as("m") })
    .from(linkChecks)
    .where(and(eq(linkChecks.website_id, site.id), gte(linkChecks.checked_at, since)))
    .groupBy(linkChecks.url)
    .as("latest");
  const firstSource = (column: typeof crawlSources.source_url | typeof crawlSources.source_title) =>
    sql<
      string | null
    >`(SELECT ${column} FROM ${crawlSources} WHERE ${crawlSources.website_id} = ${lc.website_id} AND ${crawlSources.target_url} = ${lc.url} LIMIT 1)`;
  return db
    .select({
      url: lc.url,
      status: lc.status,
      ok: lc.ok,
      redirect_chain: lc.redirect_chain,
      checked_at: lc.checked_at,
      link_id: brokenLinks.id,
      link_status: brokenLinks.status,
      found_on: firstSource(crawlSources.source_url),
      found_on_title: firstSource(crawlSources.source_title),
    })
    .from(lc)
    .innerJoin(latest, and(eq(latest.url, lc.url), eq(latest.m, lc.checked_at)))
    .leftJoin(
      brokenLinks,
      and(eq(brokenLinks.website_id, lc.website_id), eq(brokenLinks.url, lc.url)),
    )
    .where(and(eq(lc.website_id, site.id), gte(lc.checked_at, since)))
    .orderBy(asc(lc.ok), desc(lc.checked_at))
    .limit(limit);
}

/** Remove a site and everything recorded for it. */
export async function deleteSite(env: Env, siteId: string): Promise<void> {
  await batch([
    db.delete(notFoundEvents).where(eq(notFoundEvents.website_id, siteId)),
    db.delete(knownUrls).where(eq(knownUrls.website_id, siteId)),
    db.delete(linkChecks).where(eq(linkChecks.website_id, siteId)),
    db.delete(crawlSources).where(eq(crawlSources.website_id, siteId)),
    db.delete(brokenLinks).where(eq(brokenLinks.website_id, siteId)),
    db.delete(alerts).where(eq(alerts.website_id, siteId)),
    db.delete(websites).where(eq(websites.id, siteId)),
  ]);
}
