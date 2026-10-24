// Crawl orchestration: seed discovery, budgeting, result persistence, and the
// real page titles of known URLs.
// Findings land in broken_links (see ../links/service), which also decides
// what counts as a new failure worth alerting.
import type { CrawlMessage, Env } from '../../../types';
import { extractLinks, pageTitle } from './html';
import { loadRobots, type Robots } from './robots';
import { newId } from '../../../lib/auth';
import { urlMatchesPattern } from '../../../lib/suggest';
import { invalidateKnownUrls, openVisitorLinks, recordCrawlResult, refreshSuggestions } from '../links/service';
import { checkUrl, isWorking } from './checker';

export type CrawlSiteRow = {
  id: string; domain: string; crawl_enabled: number; crawl_max_pages: number;
  exclude_patterns: string; ignore_status_codes: string; name: string; title_job: string | null;
  last_crawl_at: number | null;
};

const UA = '404less-bot/0.1 (+https://404less.com)';

export async function getSite(env: Env, siteId: string): Promise<CrawlSiteRow | null> {
  return env.DB.prepare(
    'SELECT id, name, domain, crawl_enabled, crawl_max_pages, exclude_patterns, ignore_status_codes, title_job, last_crawl_at FROM websites WHERE id = ?',
  ).bind(siteId).first<CrawlSiteRow>();
}

export function siteOrigin(domain: string): string {
  // loopback/private hosts usually serve plain http
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(domain);
  return `${isLocal ? 'http' : 'https'}://${domain}`;
}

/** Pages to start from: known URLs (sitemap/crawl) or the homepage. */
export async function seedUrls(env: Env, site: CrawlSiteRow): Promise<string[]> {
  const known = await env.DB.prepare(
    'SELECT url FROM known_urls WHERE website_id = ? LIMIT ?',
  ).bind(site.id, site.crawl_max_pages).all<{ url: string }>();
  if (known.results.length) return known.results.map((r) => r.url);
  return [`${siteOrigin(site.domain)}/`];
}

/** Start a run: reset per-run sources, stamp the site, return the first batch of messages. */
export async function startCrawl(env: Env, site: CrawlSiteRow): Promise<CrawlMessage[]> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM crawl_sources WHERE website_id = ?').bind(site.id),
    env.DB.prepare('UPDATE websites SET last_crawl_at = ? WHERE id = ?').bind(now, site.id),
  ]);
  const seeds = await seedUrls(env, site);
  const pages: CrawlMessage[] = seeds.slice(0, site.crawl_max_pages)
    .map((url) => ({ kind: 'fetch-page', siteId: site.id, url, depth: 0 }));
  // Verify open links visitors reported so they auto-resolve once fixed.
  const recheck: CrawlMessage[] = (await openVisitorLinks(env, site.id))
    .map((url) => ({ kind: 'check-link', siteId: site.id, url, sourceUrl: `${siteOrigin(site.domain)}/` }));
  return [...pages, ...recheck];
}

function excluded(url: string, patterns: string[]): boolean {
  return patterns.some((p) => urlMatchesPattern(url, p));
}

/** Fetch a page, extract links, record sources, enqueue checks + same-host page fetches. */
export async function fetchPage(env: Env, site: CrawlSiteRow, url: string, depth: number): Promise<CrawlMessage[]> {
  const next: CrawlMessage[] = [];
  if (depth > 2) return next;
  // many pages link to the same page: fetch it once per run (crawl_sources is reset at run start),
  // and not at all once its link check failed
  const done = await env.DB.prepare(
    `SELECT 1 AS ok FROM crawl_sources WHERE website_id = ?1 AND source_url = ?2
     UNION ALL SELECT 1 FROM link_checks WHERE website_id = ?1 AND url = ?2 AND ok = 0 AND checked_at >= ?3 LIMIT 1`,
  ).bind(site.id, url, site.last_crawl_at ?? Date.now()).first();
  if (done) return next;
  const host = site.domain.replace(/^www\./, '');

  let html: string;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // a broken seed page (sitemap entry, homepage) is a finding; a linked page is checked
      // from the page that links to it, which also records where it was found
      await res.body?.cancel();
      if (depth > 0 || isWorking(res.status, site)) return next;
      const ts = Date.now();
      await env.DB.prepare(
        'INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (?, ?, ?, ?, 0, NULL, ?)',
      ).bind(newId(), site.id, url, res.status, ts).run();
      const outcome = await recordCrawlResult(env, site.id, url, { status: res.status, ok: false }, ts);
      if (outcome.alert) await notifyDigest(env, site.id, url, null);
      return next;
    }
    // a redirect to another site isn't one of our pages; a same-site redirect is the page it lands on
    const landed = new URL(res.url || url);
    if (landed.host.replace(/^www\./, '') !== host) { await res.body?.cancel(); return next; }
    url = landed.toString();
    html = await res.text();
  } catch {
    return next;
  }

  // capture the real page title (spares the page a separate title fetch)
  const title = pageTitle(html);
  if (title) {
    const ts = Date.now();
    await env.DB.prepare(
      `INSERT INTO known_urls (id, website_id, url, title, source, added_at, title_checked_at)
       VALUES (?, ?, ?, ?, 'crawl', ?, ?)
       ON CONFLICT(website_id, url) DO UPDATE SET title = excluded.title, title_checked_at = excluded.title_checked_at`,
    ).bind(newId(), site.id, url, title, ts, ts).run();
    invalidateKnownUrls(site.id);
  }

  const { links, assets } = extractLinks(url, html);
  let excludes: string[] = [];
  try { excludes = JSON.parse(site.exclude_patterns ?? '[]'); } catch {}

  const stmts = [];
  for (const l of links) {
    if (excluded(l.url, excludes)) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO crawl_sources (website_id, source_url, target_url, anchor) VALUES (?, ?, ?, ?)
         ON CONFLICT(website_id, source_url, target_url) DO UPDATE SET anchor = excluded.anchor`,
      ).bind(site.id, url, l.url, l.anchor),
    );
    next.push({ kind: 'check-link', siteId: site.id, url: l.url, sourceUrl: url, anchor: l.anchor ?? undefined });
  }
  for (const a of assets) {
    if (excluded(a, excludes)) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO crawl_sources (website_id, source_url, target_url, anchor) VALUES (?, ?, ?, NULL)
         ON CONFLICT(website_id, source_url, target_url) DO NOTHING`,
      ).bind(site.id, url, a),
    );
    next.push({ kind: 'check-link', siteId: site.id, url: a, sourceUrl: url });
  }
  // enqueue same-host pages for further crawling (robots-respecting, memoized per run)
  if (depth < 2) {
    let robots: Robots | null = null;
    for (const l of links) {
      let u: URL;
      try { u = new URL(l.url); } catch { continue; }
      if (u.host.replace(/^www\./, '') !== host) continue;
      if (u.hash || u.search) continue;
      if (excluded(l.url, excludes)) continue;
      robots ??= await loadRobots(siteOrigin(site.domain));
      if (!robots.allowed(u.pathname)) continue;
      next.push({ kind: 'fetch-page', siteId: site.id, url: l.url, depth: depth + 1 });
    }
  }
  // write sources in chunks
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return next;
}

// A few pages per message: up to 10 messages share one consumer invocation, and the
// Free plan allows 50 subrequests per invocation.
const TITLES_PER_MESSAGE = 5;

/** Start title jobs for these sites, replacing any job already running. Returns the first messages to send. */
export async function startTitleJobs(env: Env, siteIds: string[]): Promise<CrawlMessage[]> {
  const jobs = siteIds.map((siteId) => ({ kind: 'fetch-titles' as const, siteId, job: crypto.randomUUID() }));
  for (let i = 0; i < jobs.length; i += 50) {
    await env.DB.batch(jobs.slice(i, i + 50).map((j) => env.DB.prepare('UPDATE websites SET title_job = ? WHERE id = ?').bind(j.job, j.siteId)));
  }
  return jobs;
}

/**
 * Fetch real <title>s for known pages that haven't been tried yet (sitemap imports
 * store none). Returns the next message while more pages are waiting, so a site's
 * backlog drains a few pages at a time, one request at a time.
 */
export async function fetchTitles(env: Env, site: CrawlSiteRow, job: string): Promise<CrawlMessage[]> {
  if (site.title_job !== job) return []; // a newer job took over
  const pending = await env.DB.prepare('SELECT url FROM known_urls WHERE website_id = ? AND title_checked_at IS NULL LIMIT ?')
    .bind(site.id, TITLES_PER_MESSAGE).all<{ url: string }>();

  const stmts = [];
  for (const { url } of pending.results) {
    const title = await fetchTitle(url);
    // no title found: keep what's there (NULL, or a slug guess from before titles were fetched)
    stmts.push(env.DB.prepare('UPDATE known_urls SET title = COALESCE(?, title), title_checked_at = ? WHERE website_id = ? AND url = ?')
      .bind(title, Date.now(), site.id, url));
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (pending.results.length === TITLES_PER_MESSAGE) {
    invalidateKnownUrls(site.id);
    return [{ kind: 'fetch-titles', siteId: site.id, job }];
  }
  // done: re-rank open links so their stored suggestions carry the titles (shared ones dropped)
  await refreshSuggestions(env, site.id, 50);
  return [];
}

/** A page's title, reading only as far as </head>; null for errors, non-HTML and untitled pages. */
async function fetchTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get('content-type');
    if (!res.ok || !res.body || (type && !/html/i.test(type))) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let head = '';
    while (head.length < 64 * 1024 && !/<\/head>/i.test(head)) {
      const { done, value } = await reader.read();
      if (done) break;
      head += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return pageTitle(head);
  } catch {
    return null;
  }
}

/** Check one URL, persist the check, update broken_links. Returns whether to alert. */
export async function checkLink(env: Env, site: CrawlSiteRow, msg: Extract<CrawlMessage, { kind: 'check-link' }>): Promise<boolean> {
  // every page linking to a URL enqueues a check for it: check it once per run
  if (site.last_crawl_at) {
    const done = await env.DB.prepare('SELECT 1 AS ok FROM link_checks WHERE website_id = ? AND url = ? AND checked_at >= ? LIMIT 1')
      .bind(site.id, msg.url, site.last_crawl_at).first();
    if (done) return false;
  }
  const result = await checkUrl(msg.url, site);
  const ts = Date.now();
  await env.DB.prepare(
    'INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), site.id, msg.url, result.status, result.ok ? 1 : 0, result.redirectChain ? JSON.stringify(result.redirectChain) : null, ts).run();
  const outcome = await recordCrawlResult(env, site.id, msg.url, result, ts);
  return outcome.alert;
}

/** Forward a crawler finding to the per-site digest DO (groups with realtime 404 alerts). */
export async function notifyDigest(env: Env, siteId: string, url: string, referrer: string | null): Promise<void> {
  const doStub = env.DIGEST.get(env.DIGEST.idFromName(siteId));
  await doStub.fetch('https://digest/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ts: Date.now(), referrer }),
  });
}
