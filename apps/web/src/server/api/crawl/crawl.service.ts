// Crawl work, one task at a time: starting a run, fetching a page, checking a
// link, reading the real titles of known URLs. The crawl tick (crawl.tick.ts)
// decides when each runs. Pages and links to visit are rows in crawl_tasks
// (the run's frontier), deduplicated per run by URL.
// Findings land in broken_links (see ../links/service), which also decides
// what counts as a new failure worth alerting.
import type { Env } from "../../types";
import { extractLinks, pageTitle } from "./html";
import { loadRobots, type Robots } from "./robots";
import { newId } from "../../lib/auth";
import { urlMatchesPattern } from "../../lib/suggest";
import { isAlwaysIgnored } from "../../lib/ignored-urls";
import {
  invalidateKnownUrls,
  openVisitorLinks,
  recordCrawlResult,
  refreshSuggestions,
} from "../links/links.service";
import { checkUrl, isWorking } from "./checker";
import { crawlerFetch, rethrowIfBudgetSpent } from "./subrequests";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  batch,
  batchAll,
  brokenLinks,
  crawlSources,
  crawlTasks,
  db,
  knownUrls,
  linkChecks,
  websites,
} from "../../db";

export type CrawlSiteRow = {
  id: string;
  domain: string;
  crawl_enabled: number;
  crawl_max_pages: number;
  exclude_patterns: string;
  ignore_status_codes: string;
  name: string;
  last_crawl_at: number | null;
  crawl_cursor: number | null;
  crawl_pages: number;
};

export type CrawlTask = typeof crawlTasks.$inferSelect;
type NewTask = Omit<typeof crawlTasks.$inferInsert, "id" | "website_id" | "attempts">;

const UA = "404less-bot/0.1 (+https://404less.com)";

export async function getSite(env: Env, siteId: string): Promise<CrawlSiteRow | null> {
  const site = await db
    .select({
      id: websites.id,
      name: websites.name,
      domain: websites.domain,
      crawl_enabled: websites.crawl_enabled,
      crawl_max_pages: websites.crawl_max_pages,
      exclude_patterns: websites.exclude_patterns,
      ignore_status_codes: websites.ignore_status_codes,
      last_crawl_at: websites.last_crawl_at,
      crawl_cursor: websites.crawl_cursor,
      crawl_pages: websites.crawl_pages,
    })
    .from(websites)
    .where(eq(websites.id, siteId))
    .get();
  return site ?? null;
}

export function siteOrigin(domain: string): string {
  // loopback/private hosts usually serve plain http
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    domain,
  );
  return `${isLocal ? "http" : "https"}://${domain}`;
}

/** Pages to start from: known URLs (sitemap/crawl) or the homepage. */
export async function seedUrls(env: Env, site: CrawlSiteRow): Promise<string[]> {
  const known = await db
    .select({ url: knownUrls.url })
    .from(knownUrls)
    .where(eq(knownUrls.website_id, site.id))
    .limit(site.crawl_max_pages);
  if (known.length) return known.map((r) => r.url);
  return [`${siteOrigin(site.domain)}/`];
}

/**
 * Start a run: drop what is left of the previous one, stamp the site, and queue
 * the starting pages plus a recheck of every open link (so links visitors
 * reported resolve on their own once fixed). The crawl tick does the rest.
 */
export async function startRun(env: Env, site: CrawlSiteRow): Promise<void> {
  const seeds = (await seedUrls(env, site)).slice(0, site.crawl_max_pages);
  const rechecks = await openVisitorLinks(env, site.id);
  await batch([
    db.delete(crawlTasks).where(eq(crawlTasks.website_id, site.id)),
    db
      .update(websites)
      .set({ last_crawl_at: Date.now(), crawl_cursor: 0, crawl_pages: seeds.length })
      .where(eq(websites.id, site.id)),
  ]);
  const home = `${siteOrigin(site.domain)}/`;
  await queueTasks(site.id, [
    ...seeds.map((url): NewTask => ({ kind: "page", url, depth: 0 })),
    ...rechecks.map((url): NewTask => ({ kind: "link", url, source_url: home })),
  ]);
}

// D1 caps a statement at 100 bound parameters; a task row binds up to 8.
const TASKS_PER_INSERT = 10;

/**
 * Add tasks to a site's run; a URL already queued in this run is not queued
 * again. A link first queued as a recheck takes the page it is then found on,
 * so a broken link still records where it lives.
 */
export async function queueTasks(siteId: string, tasks: NewTask[]): Promise<void> {
  const stmts: BatchItem<"sqlite">[] = [];
  for (let i = 0; i < tasks.length; i += TASKS_PER_INSERT) {
    const rows = tasks.slice(i, i + TASKS_PER_INSERT).map((t) => ({
      website_id: siteId,
      kind: t.kind,
      url: t.url,
      depth: t.depth ?? 0,
      source_url: t.source_url ?? null,
      source_title: t.source_title ?? null,
      anchor: t.anchor ?? null,
      found_on_page: t.found_on_page ?? 0,
    }));
    stmts.push(
      db
        .insert(crawlTasks)
        .values(rows)
        .onConflictDoUpdate({
          target: [crawlTasks.website_id, crawlTasks.kind, crawlTasks.url],
          set: {
            source_url: sql`excluded.source_url`,
            source_title: sql`excluded.source_title`,
            anchor: sql`excluded.anchor`,
            found_on_page: 1,
          },
          // otherwise a no-op: an existing row is not rewritten (no D1 write)
          setWhere: sql`${crawlTasks.found_on_page} = 0 AND excluded.found_on_page = 1`,
        }),
    );
  }
  for (let i = 0; i < stmts.length; i += 50) await batchAll(stmts.slice(i, i + 50));
}

/** Of these page URLs, the ones not yet queued in the site's run. */
async function unqueuedPages(siteId: string, urls: string[]): Promise<string[]> {
  const queued = new Set<string>();
  for (let i = 0; i < urls.length; i += 90) {
    const rows = await db
      .select({ url: crawlTasks.url })
      .from(crawlTasks)
      .where(
        and(
          eq(crawlTasks.website_id, siteId),
          eq(crawlTasks.kind, "page"),
          inArray(crawlTasks.url, urls.slice(i, i + 90)),
        ),
      );
    for (const r of rows) queued.add(r.url);
  }
  return urls.filter((u) => !queued.has(u));
}

function excluded(url: string, patterns: string[]): boolean {
  return isAlwaysIgnored(url) || patterns.some((p) => urlMatchesPattern(url, p));
}

/**
 * Fetch a page, record the links on it, and queue a check for each link plus a
 * fetch of each same-site page it links to (robots-respecting, within the
 * site's page budget). Returns how many pages it queued.
 */
export async function fetchPage(
  env: Env,
  site: CrawlSiteRow,
  url: string,
  depth: number,
): Promise<number> {
  // a page whose link check already failed this run isn't fetched
  const failed = await db
    .select({ ok: sql<number>`1` })
    .from(linkChecks)
    .where(
      and(
        eq(linkChecks.website_id, site.id),
        eq(linkChecks.url, url),
        eq(linkChecks.ok, 0),
        gte(linkChecks.checked_at, site.last_crawl_at ?? Date.now()),
      ),
    )
    .limit(1);
  if (failed.length) return 0;
  const host = site.domain.replace(/^www\./, "");

  let html: string;
  try {
    const res = await crawlerFetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // a broken seed page (sitemap entry, homepage) is a finding; a linked page is checked
      // from the page that links to it, which also records where it was found
      await res.body?.cancel();
      if (depth > 0 || isWorking(res.status, site)) return 0;
      const ts = Date.now();
      await db.insert(linkChecks).values({
        id: newId(),
        website_id: site.id,
        url,
        status: res.status,
        ok: 0,
        redirect_chain: null,
        checked_at: ts,
      });
      const outcome = await recordCrawlResult(
        env,
        site.id,
        url,
        { status: res.status, ok: false },
        ts,
      );
      if (outcome.alert) await notifyDigest(env, site.id, url, null);
      return 0;
    }
    // a redirect to another site isn't one of our pages; a same-site redirect is the page
    // it lands on, crawled as its own task (once per run, however many URLs lead there)
    const landed = new URL(res.url || url);
    if (landed.host.replace(/^www\./, "") !== host) {
      await res.body?.cancel();
      return 0;
    }
    if (landed.toString() !== new URL(url).toString()) {
      await res.body?.cancel();
      await queueTasks(site.id, [{ kind: "page", url: landed.toString(), depth }]);
      return 0;
    }
    html = await res.text();
  } catch (error) {
    rethrowIfBudgetSpent(error);
    return 0;
  }

  // capture the real page title (spares the page a separate title fetch)
  const title = pageTitle(html);
  if (title) {
    const ts = Date.now();
    await batch([
      db
        .insert(knownUrls)
        .values({
          id: newId(),
          website_id: site.id,
          url,
          title,
          source: "crawl",
          added_at: ts,
          title_checked_at: ts,
        })
        .onConflictDoUpdate({
          target: [knownUrls.website_id, knownUrls.url],
          set: { title: sql`excluded.title`, title_checked_at: sql`excluded.title_checked_at` },
        }),
      // a working page's title is the best title a broken row could ever show
      setBrokenLinkTitle(site.id, url, title),
    ]);
    invalidateKnownUrls(site.id);
  }

  const { links, assets } = extractLinks(url, html);
  let excludes: string[] = [];
  try {
    excludes = JSON.parse(site.exclude_patterns ?? "[]");
  } catch {}

  // every link and asset on the page: its anchor (assets have none)
  const found = new Map<string, string | null>();
  for (const l of links) if (!excluded(l.url, excludes)) found.set(l.url, l.anchor);
  for (const a of assets) if (!found.has(a) && !excluded(a, excludes)) found.set(a, null);

  // same-host pages to crawl further, within the run's page budget
  const pages: string[] = [];
  const budget = site.crawl_max_pages - site.crawl_pages;
  if (depth < 2 && budget > 0) {
    let robots: Robots | null = null;
    const candidates: string[] = [];
    for (const l of links) {
      let u: URL;
      try {
        u = new URL(l.url);
      } catch {
        continue;
      }
      if (u.host.replace(/^www\./, "") !== host) continue;
      if (u.hash || u.search) continue;
      if (excluded(l.url, excludes)) continue;
      robots ??= await loadRobots(siteOrigin(site.domain));
      if (!robots.allowed(u.pathname)) continue;
      candidates.push(l.url);
    }
    if (candidates.length)
      pages.push(...(await unqueuedPages(site.id, candidates)).slice(0, budget));
  }

  await recordSources(site.id, url, title, found);
  await queueTasks(site.id, [
    ...[...found].map(
      ([target, anchor]): NewTask => ({
        kind: "link",
        url: target,
        source_url: url,
        source_title: title,
        anchor,
        found_on_page: 1,
      }),
    ),
    ...pages.map((page): NewTask => ({ kind: "page", url: page, depth: depth + 1 })),
  ]);
  return pages.length;
}

/**
 * Bring a page's rows in crawl_sources in line with the links found on it: add
 * new ones, update changed anchors/titles, drop links no longer there. An
 * unchanged page writes nothing.
 */
async function recordSources(
  siteId: string,
  sourceUrl: string,
  title: string | null,
  found: Map<string, string | null>,
): Promise<void> {
  const existing = await db
    .select({
      target_url: crawlSources.target_url,
      anchor: crawlSources.anchor,
      source_title: crawlSources.source_title,
    })
    .from(crawlSources)
    .where(and(eq(crawlSources.website_id, siteId), eq(crawlSources.source_url, sourceUrl)));
  const had = new Map(existing.map((r) => [r.target_url, r]));
  const row = (target: string) =>
    and(
      eq(crawlSources.website_id, siteId),
      eq(crawlSources.source_url, sourceUrl),
      eq(crawlSources.target_url, target),
    );

  const stmts: BatchItem<"sqlite">[] = [];
  for (const [target, anchor] of found) {
    const old = had.get(target);
    if (!old) {
      stmts.push(
        db
          .insert(crawlSources)
          .values({
            website_id: siteId,
            source_url: sourceUrl,
            target_url: target,
            anchor,
            source_title: title,
          })
          .onConflictDoNothing(),
      );
    } else if (old.anchor !== anchor || (title !== null && old.source_title !== title)) {
      stmts.push(
        db
          .update(crawlSources)
          .set({ anchor, source_title: title ?? old.source_title })
          .where(row(target)),
      );
    }
  }
  for (const target of had.keys()) {
    if (!found.has(target)) stmts.push(db.delete(crawlSources).where(row(target)));
  }
  for (let i = 0; i < stmts.length; i += 50) await batchAll(stmts.slice(i, i + 50));
}

/**
 * Fetch real <title>s for up to `limit` known pages of a site that haven't been
 * tried yet (sitemap imports store none). Returns true once the site has none
 * left, after re-ranking its open links so their suggestions carry the titles.
 */
export async function fetchTitles(env: Env, siteId: string, limit: number): Promise<boolean> {
  const pending = await db
    .select({ url: knownUrls.url })
    .from(knownUrls)
    .where(and(eq(knownUrls.website_id, siteId), isNull(knownUrls.title_checked_at)))
    .limit(limit + 1);

  const stmts: BatchItem<"sqlite">[] = [];
  for (const { url } of pending.slice(0, limit)) {
    const title = await fetchTitle(url);
    // no title found: keep what's there (NULL, or a slug guess from before titles were fetched)
    stmts.push(
      db
        .update(knownUrls)
        .set({ title: sql`COALESCE(${title}, ${knownUrls.title})`, title_checked_at: Date.now() })
        .where(and(eq(knownUrls.website_id, siteId), eq(knownUrls.url, url))),
    );
    if (title) {
      // the page works: its real title is better than anything a broken row has
      stmts.push(setBrokenLinkTitle(siteId, url, title));
      stmts.push(
        db
          .update(crawlSources)
          .set({ source_title: title })
          .where(
            and(
              eq(crawlSources.website_id, siteId),
              eq(crawlSources.source_url, url),
              isNull(crawlSources.source_title),
            ),
          ),
      );
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await batchAll(stmts.slice(i, i + 50));
  invalidateKnownUrls(siteId);
  if (pending.length > limit) return false;
  // done: re-rank open links so their stored suggestions carry the titles (shared ones dropped)
  await refreshSuggestions(env, siteId, 50);
  return true;
}

/** A page's title, reading only as far as </head>; null for errors, non-HTML and untitled pages. */
async function fetchTitle(url: string): Promise<string | null> {
  try {
    const res = await crawlerFetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const type = res.headers.get("content-type");
    if (!res.ok || !res.body || (type && !/html/i.test(type))) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let head = "";
    while (head.length < 64 * 1024 && !/<\/head>/i.test(head)) {
      const { done, value } = await reader.read();
      if (done) break;
      head += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return pageTitle(head);
  } catch (error) {
    rethrowIfBudgetSpent(error);
    return null;
  }
}

/** Check one URL, persist the check, update broken_links. Returns whether to alert. */
export async function checkLink(
  env: Env,
  site: CrawlSiteRow,
  task: Pick<CrawlTask, "url" | "source_url" | "source_title" | "anchor" | "found_on_page">,
): Promise<boolean> {
  // a URL that is also a page, or a recheck found on a page, is checked once per run
  if (site.last_crawl_at) {
    const done = await db
      .select({ ok: sql<number>`1` })
      .from(linkChecks)
      .where(
        and(
          eq(linkChecks.website_id, site.id),
          eq(linkChecks.url, task.url),
          gte(linkChecks.checked_at, site.last_crawl_at),
        ),
      )
      .limit(1)
      .get();
    if (done) return false;
  }
  const result = await checkUrl(task.url, site);
  const ts = Date.now();
  await db.insert(linkChecks).values({
    id: crypto.randomUUID(),
    website_id: site.id,
    url: task.url,
    status: result.status,
    ok: result.ok ? 1 : 0,
    redirect_chain: result.redirectChain ? JSON.stringify(result.redirectChain) : null,
    checked_at: ts,
  });
  const foundOn =
    task.found_on_page && task.source_url
      ? { url: task.source_url, title: task.source_title ?? null, anchor: task.anchor ?? null }
      : undefined;
  const outcome = await recordCrawlResult(env, site.id, task.url, result, ts, foundOn);
  return outcome.alert;
}

/** Forward a crawler finding to the per-site digest DO (groups with realtime 404 alerts). */
export async function notifyDigest(
  env: Env,
  siteId: string,
  url: string,
  referrer: string | null,
): Promise<void> {
  const doStub = env.DIGEST.get(env.DIGEST.idFromName(siteId));
  await doStub.fetch("https://digest/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ts: Date.now(), referrer }),
  });
}

/** A working page's title is the best title a broken row for that URL could ever show. */
function setBrokenLinkTitle(siteId: string, url: string, title: string) {
  return db
    .update(brokenLinks)
    .set({ title })
    .where(
      and(
        eq(brokenLinks.website_id, siteId),
        eq(brokenLinks.url, url),
        or(isNull(brokenLinks.title), ne(brokenLinks.title, title)),
      ),
    );
}
