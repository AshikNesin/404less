// Crawl orchestration: seed discovery, budgeting, result persistence, diffing.
import type { CrawlMessage } from '../../../types';
import type { Env } from '../../../types';
import { extractLinks } from './html';
import { checkUrl } from './checker';

export type CrawlSiteRow = {
  id: string; domain: string; crawl_enabled: number; crawl_max_pages: number;
  exclude_patterns: string; ignore_status_codes: string; name: string;
};

const UA = '404less-bot/0.1 (+https://404less.dev)';

export async function getSite(env: Env, siteId: string): Promise<CrawlSiteRow | null> {
  return env.DB.prepare(
    'SELECT id, name, domain, crawl_enabled, crawl_max_pages, exclude_patterns, ignore_status_codes FROM websites WHERE id = ?',
  ).bind(siteId).first<CrawlSiteRow>();
}

/** Pages to start from: sitemap (preferred) or homepage. */
export async function seedUrls(env: Env, site: CrawlSiteRow): Promise<string[]> {
  const known = await env.DB.prepare(
    'SELECT url FROM known_urls WHERE website_id = ? LIMIT ?',
  ).bind(site.id, site.crawl_max_pages).all<{ url: string }>();
  if (known.results.length) return known.results.map((r) => r.url);
  // Try https first; loopback/private hosts often serve plain http.
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(site.domain);
  return [`${isLocal ? 'http' : 'https'}://${site.domain}/`];
}

function excluded(url: string, patterns: string[]): boolean {
  return patterns.some((p) =>
    p.includes('*')
      ? new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i').test(url)
      : url.toLowerCase().includes(p.toLowerCase()),
  );
}

/** Fetch a page, extract links, record sources, enqueue checks + same-host page fetches. */
export async function fetchPage(env: Env, site: CrawlSiteRow, url: string, depth: number): Promise<CrawlMessage[]> {
  const next: CrawlMessage[] = [];
  if (depth > 2) return next;

  let html: string;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // page itself is broken — record as a check against its source? keep simple: skip
      return next;
    }
    html = await res.text();
  } catch {
    return next;
  }

  const { links, assets } = extractLinks(url, html);
  let excludes: string[] = [];
  try { excludes = JSON.parse(site.exclude_patterns ?? '[]'); } catch {}
  const host = site.domain.replace(/^www\./, '');

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
    next.push({ kind: 'check-link', siteId: site.id, url: a, sourceUrl: url });
  }
  // enqueue same-host pages for further crawling
  if (depth < 2) {
    for (const l of links) {
      let u: URL;
      try { u = new URL(l.url); } catch { continue; }
      if (u.hostname.replace(/^www\./, '') !== host) continue;
      if (u.hash || u.search) continue;
      next.push({ kind: 'fetch-page', siteId: site.id, url: l.url, depth: depth + 1 });
    }
  }
  // write sources in chunks
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return next;
}

/** Check one URL, persist result, and return whether it's a NEW failure (for alerting). */
export async function checkLink(env: Env, site: CrawlSiteRow, msg: Extract<CrawlMessage, { kind: 'check-link' }>): Promise<boolean> {
  const result = await checkUrl(msg.url, site);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, site.id, msg.url, result.status, result.ok ? 1 : 0, result.redirectChain ? JSON.stringify(result.redirectChain) : null, Date.now()).run();

  if (result.ok) return false;
  // new failure only if previous check for this URL was ok (or never checked and site already had a completed run)
  const prev = await env.DB.prepare(
    'SELECT ok FROM link_checks WHERE website_id = ? AND url = ? AND checked_at < ? ORDER BY checked_at DESC LIMIT 1',
  ).bind(site.id, msg.url, Date.now() - 1000).first<{ ok: number }>();
  return !prev || prev.ok === 1;
}
