// Broken links: the one list the dashboard manages. Both detectors feed it —
// visitor 404 hits (embed → /api/track) and crawler link checks — and the user
// triages rows between open / resolved / ignored. The crawler also resolves
// and reopens rows on its own as URLs come back or break again.
import type { Env } from "../../types";
import { prepareKnown, rankPrepared, type PreparedKnown, type Suggestion } from "../../lib/suggest";
import { checkUrl } from "../crawl/checker";
import type { SiteRow } from "../sites/sites.helpers";
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  batch,
  batchAll,
  brokenLinks,
  changes,
  crawlSources,
  db,
  knownUrls,
  linkChecks,
  notFoundEvents,
} from "../../db";

export type LinkStatus = "open" | "resolved" | "ignored";
export type LinkSource = "visitor" | "crawler" | "both";
export const LINK_STATUSES: readonly LinkStatus[] = ["open", "resolved", "ignored"];

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
  title: string | null;
  suggested_url: string | null;
  suggested_title: string | null;
};

export type ListRow = BrokenLinkRow & { source_pages: number; found_on: string | null };

export type ListQuery = {
  status: LinkStatus | "all";
  source?: "visitor" | "crawler";
  q?: string;
  sort: "hits" | "last_seen" | "first_seen";
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
  const rows = await db
    .select({ url: knownUrls.url, title: knownUrls.title })
    .from(knownUrls)
    .where(eq(knownUrls.website_id, siteId))
    .limit(KNOWN_LIMIT);
  const prepared = prepareKnown(rows);
  knownCache.set(siteId, { at: Date.now(), prepared });
  return prepared;
}

/** Ranked replacement candidates for a broken URL (same engine as the embed + MCP). */
export async function suggestFor(
  env: Env,
  siteId: string,
  url: string,
  limit = 3,
): Promise<Suggestion[]> {
  return rankPrepared(url, await knownIndex(env, siteId), limit);
}

async function findByUrl(env: Env, siteId: string, url: string) {
  const row = await db
    .select({ id: brokenLinks.id, status: brokenLinks.status, source: brokenLinks.source })
    .from(brokenLinks)
    .where(and(eq(brokenLinks.website_id, siteId), eq(brokenLinks.url, url)))
    .get();
  return row as { id: string; status: LinkStatus; source: LinkSource } | undefined;
}

/** The best title for a URL right now: the known page's title, else the live 404 title. */
async function titleFor(
  env: Env,
  siteId: string,
  url: string,
  fallback: string | null,
): Promise<string | null> {
  if (fallback) return fallback;
  const row = await db
    .select({ title: knownUrls.title })
    .from(knownUrls)
    .where(and(eq(knownUrls.website_id, siteId), eq(knownUrls.url, url)))
    .get();
  return row?.title ?? null;
}

async function insertLink(
  env: Env,
  siteId: string,
  url: string,
  source: LinkSource,
  ts: number,
  httpStatus: number | null,
  hits: number,
  title: string | null = null,
) {
  const id = crypto.randomUUID();
  const [best] = await suggestFor(env, siteId, url, 1);
  const ownTitle = await titleFor(env, siteId, url, title);
  await db.insert(brokenLinks).values({
    id,
    website_id: siteId,
    url,
    status: "open",
    source,
    hits,
    http_status: httpStatus,
    first_seen: ts,
    last_seen: ts,
    title: ownTitle,
    suggested_url: best?.url ?? null,
    suggested_title: best?.title ?? null,
  });
  return id;
}

export type HitOutcome = { id: string; status: LinkStatus; isNew: boolean; reopened: boolean };

/** A visitor hit the URL: count it, open/reopen the row. Ignored rows stay ignored. */
export async function recordVisitorHit(
  env: Env,
  siteId: string,
  url: string,
  ts: number,
  title: string | null = null,
): Promise<HitOutcome> {
  const prev = await findByUrl(env, siteId, url);
  if (!prev) {
    const id = await insertLink(env, siteId, url, "visitor", ts, null, 1, title);
    return { id, status: "open", isNew: true, reopened: false };
  }
  const reopened = prev.status === "resolved";
  const status: LinkStatus = reopened ? "open" : prev.status;
  await db
    .update(brokenLinks)
    .set({
      hits: sql`${brokenLinks.hits} + 1`,
      last_seen: ts,
      status,
      title: sql`COALESCE(${brokenLinks.title}, ${title})`,
      source: sql`CASE WHEN ${brokenLinks.source} = 'crawler' THEN 'both' ELSE ${brokenLinks.source} END`,
      ...(status === "open" && { resolved_at: null }),
    })
    .where(eq(brokenLinks.id, prev.id));
  return { id: prev.id, status, isNew: false, reopened };
}

export type CheckOutcome = { alert: boolean; status: LinkStatus | null };

/** The crawler checked the URL: a failure opens/reopens the row, a success resolves it. */
export async function recordCrawlResult(
  env: Env,
  siteId: string,
  url: string,
  result: { status: number; ok: boolean },
  ts: number,
): Promise<CheckOutcome> {
  const prev = await findByUrl(env, siteId, url);
  if (result.ok) {
    if (!prev) return { alert: false, status: null };
    const status: LinkStatus = prev.status === "open" ? "resolved" : prev.status;
    // stamp resolved_at when this check is what resolved the row; an already-resolved
    // row keeps its original time, and ignored rows never get one
    await db
      .update(brokenLinks)
      .set({
        http_status: result.status,
        status,
        ...(status === "resolved" && prev.status !== "resolved" && { resolved_at: ts }),
      })
      .where(eq(brokenLinks.id, prev.id));
    return { alert: false, status };
  }
  if (!prev) {
    await insertLink(env, siteId, url, "crawler", ts, result.status, 0);
    return { alert: true, status: "open" };
  }
  const reopened = prev.status === "resolved";
  const status: LinkStatus = reopened ? "open" : prev.status;
  await db
    .update(brokenLinks)
    .set({
      http_status: result.status,
      last_seen: ts,
      status,
      source: sql`CASE WHEN ${brokenLinks.source} = 'visitor' THEN 'both' ELSE ${brokenLinks.source} END`,
      ...(status === "open" && { resolved_at: null }),
    })
    .where(eq(brokenLinks.id, prev.id));
  return { alert: reopened, status };
}

export async function listLinks(env: Env, siteId: string, q: ListQuery) {
  const where: SQL[] = [eq(brokenLinks.website_id, siteId)];
  if (q.status !== "all") where.push(eq(brokenLinks.status, q.status));
  if (q.source === "visitor") where.push(inArray(brokenLinks.source, ["visitor", "both"]));
  if (q.source === "crawler") where.push(inArray(brokenLinks.source, ["crawler", "both"]));
  if (q.q) where.push(sql`instr(lower(${brokenLinks.url}), ${q.q.toLowerCase()}) > 0`);
  const order =
    q.sort === "hits"
      ? [desc(brokenLinks.hits), desc(brokenLinks.last_seen)]
      : q.sort === "first_seen"
        ? [desc(brokenLinks.first_seen)]
        : [desc(brokenLinks.last_seen)];
  const w = and(...where);
  const sourcesOf = sql`${crawlSources.website_id} = ${brokenLinks.website_id} AND ${crawlSources.target_url} = ${brokenLinks.url}`;

  const [rows, total, counts] = await batch([
    db
      .select({
        ...getTableColumns(brokenLinks),
        source_pages: sql<number>`(SELECT COUNT(*) FROM ${crawlSources} WHERE ${sourcesOf})`,
        found_on: sql<
          string | null
        >`(SELECT ${crawlSources.source_url} FROM ${crawlSources} WHERE ${sourcesOf} LIMIT 1)`,
      })
      .from(brokenLinks)
      .where(w)
      .orderBy(...order)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db.select({ n: count() }).from(brokenLinks).where(w),
    db
      .select({ status: brokenLinks.status, n: count() })
      .from(brokenLinks)
      .where(eq(brokenLinks.website_id, siteId))
      .groupBy(brokenLinks.status),
  ]);
  const byStatus: Record<LinkStatus, number> = { open: 0, resolved: 0, ignored: 0 };
  for (const r of counts) byStatus[r.status as LinkStatus] = r.n;
  return {
    links: rows as ListRow[],
    total: total[0].n,
    counts: byStatus,
    page: q.page,
    limit: q.limit,
  };
}

export type DaySeries = { day: string; hits: number }[];

/** Daily buckets for the last N days (UTC), zero-filled, oldest first. */
export function fillDays(
  rows: { day: number; n: number }[],
  days: number,
  now = Date.now(),
): DaySeries {
  const today = Math.floor(now / 86_400_000);
  const map = new Map(rows.map((r) => [r.day, r.n]));
  const out: DaySeries = [];
  for (let d = today - days + 1; d <= today; d++) {
    out.push({ day: new Date(d * 86_400_000).toISOString().slice(0, 10), hits: map.get(d) ?? 0 });
  }
  return out;
}

export async function getLink(env: Env, siteId: string, linkId: string) {
  const link = (await db
    .select()
    .from(brokenLinks)
    .where(and(eq(brokenLinks.id, linkId), eq(brokenLinks.website_id, siteId)))
    .get()) as BrokenLinkRow | undefined;
  if (!link) return null;
  const since = Date.now() - 30 * 86_400_000;
  const events = and(eq(notFoundEvents.website_id, siteId), eq(notFoundEvents.url, link.url));
  const day = sql<number>`CAST(${notFoundEvents.ts} / 86400000 AS INTEGER)`;
  const [referrers, sources, lastCheck, series, recent] = await batch([
    db
      .select({ referrer: notFoundEvents.referrer, n: count() })
      .from(notFoundEvents)
      .where(and(events, isNotNull(notFoundEvents.referrer), ne(notFoundEvents.referrer, "")))
      .groupBy(notFoundEvents.referrer)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        source_url: crawlSources.source_url,
        source_title: crawlSources.source_title,
        anchor: crawlSources.anchor,
      })
      .from(crawlSources)
      .where(and(eq(crawlSources.website_id, siteId), eq(crawlSources.target_url, link.url)))
      .limit(25),
    db
      .select({
        status: linkChecks.status,
        redirect_chain: linkChecks.redirect_chain,
        checked_at: linkChecks.checked_at,
      })
      .from(linkChecks)
      .where(and(eq(linkChecks.website_id, siteId), eq(linkChecks.url, link.url)))
      .orderBy(desc(linkChecks.checked_at))
      .limit(1),
    db
      .select({ day, n: count() })
      .from(notFoundEvents)
      .where(and(events, gte(notFoundEvents.ts, since)))
      .groupBy(day),
    db
      .select({
        referrer: notFoundEvents.referrer,
        user_agent: notFoundEvents.user_agent,
        ts: notFoundEvents.ts,
      })
      .from(notFoundEvents)
      .where(events)
      .orderBy(desc(notFoundEvents.ts))
      .limit(10),
  ]);
  const suggestions = await suggestFor(env, siteId, link.url, 5);
  const best = suggestions[0];
  if (best && best.url !== link.suggested_url) {
    await db
      .update(brokenLinks)
      .set({ suggested_url: best.url, suggested_title: best.title })
      .where(eq(brokenLinks.id, link.id));
    link.suggested_url = best.url;
    link.suggested_title = best.title;
  }
  const check = lastCheck[0];
  let chain: { url: string; status: number }[] | null = null;
  try {
    chain = check?.redirect_chain ? JSON.parse(check.redirect_chain) : null;
  } catch {}
  return {
    link,
    suggestions,
    referrers: referrers as { referrer: string; n: number }[],
    sources,
    lastCheck: check ? { status: check.status, checkedAt: check.checked_at, chain } : null,
    series: fillDays(series, 30),
    recent,
  };
}

export async function setLinkStatus(
  env: Env,
  siteId: string,
  ids: string[],
  status: LinkStatus,
): Promise<number> {
  if (!ids.length) return 0;
  const resolvedAt = status === "resolved" ? Date.now() : null;
  // D1 caps a statement at 100 bound parameters; chunk the id list
  const updates = [];
  for (let i = 0; i < ids.length; i += STATUS_IDS_PER_STATEMENT) {
    updates.push(
      db
        .update(brokenLinks)
        .set({ status, resolved_at: resolvedAt })
        .where(
          and(
            eq(brokenLinks.website_id, siteId),
            inArray(brokenLinks.id, ids.slice(i, i + STATUS_IDS_PER_STATEMENT)),
          ),
        ),
    );
  }
  const results = await batchAll(updates);
  return results.reduce((n: number, r) => n + changes(r), 0);
}

/** Ids per UPDATE in `setLinkStatus`: 50 + the 3 other parameters stays well under D1's 100. */
const STATUS_IDS_PER_STATEMENT = 50;

/** Fetch the URL now and apply the result like a crawl check would. */
export async function recheckLink(
  env: Env,
  site: Pick<SiteRow, "id" | "ignore_status_codes">,
  linkId: string,
) {
  const link = await db
    .select({ id: brokenLinks.id, url: brokenLinks.url })
    .from(brokenLinks)
    .where(and(eq(brokenLinks.id, linkId), eq(brokenLinks.website_id, site.id)))
    .get();
  if (!link) return null;
  const result = await checkUrl(link.url, site);
  const ts = Date.now();
  await db.insert(linkChecks).values({
    id: crypto.randomUUID(),
    website_id: site.id,
    url: link.url,
    status: result.status,
    ok: result.ok ? 1 : 0,
    redirect_chain: result.redirectChain ? JSON.stringify(result.redirectChain) : null,
    checked_at: ts,
  });
  const outcome = await recordCrawlResult(env, site.id, link.url, result, ts);
  return {
    httpStatus: result.status,
    ok: result.ok,
    status: outcome.status,
    chain: result.redirectChain,
  };
}

/** Recompute stored suggestions for the most-hit open links (after a sitemap import). */
export async function refreshSuggestions(env: Env, siteId: string, limit = 10): Promise<void> {
  invalidateKnownUrls(siteId);
  const rows = await db
    .select({ id: brokenLinks.id, url: brokenLinks.url })
    .from(brokenLinks)
    .where(and(eq(brokenLinks.website_id, siteId), eq(brokenLinks.status, "open")))
    .orderBy(desc(brokenLinks.hits), desc(brokenLinks.last_seen))
    .limit(limit);
  if (!rows.length) return;
  const index = await knownIndex(env, siteId);
  await batchAll(
    rows.map((r) => {
      const [best] = rankPrepared(r.url, index, 1);
      return db
        .update(brokenLinks)
        .set({ suggested_url: best?.url ?? null, suggested_title: best?.title ?? null })
        .where(eq(brokenLinks.id, r.id));
    }),
  );
}

/** URLs the crawler should verify at the start of a run: open links visitors reported. */
export async function openVisitorLinks(env: Env, siteId: string, limit = 100): Promise<string[]> {
  const rows = await db
    .select({ url: brokenLinks.url })
    .from(brokenLinks)
    .where(and(eq(brokenLinks.website_id, siteId), eq(brokenLinks.status, "open")))
    .orderBy(desc(brokenLinks.hits))
    .limit(limit);
  return rows.map((r) => r.url);
}
