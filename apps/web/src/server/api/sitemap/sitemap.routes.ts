// Authenticated: POST /api/sites/:id/import-sitemap — fetch sitemap.xml (follows
// one level of <sitemapindex>), store known URLs in D1 for the suggestions engine.
// Sitemaps carry no titles: a fetch-titles queue job reads them from the pages.
import { Hono } from "hono";
import { isValidHttpUrl, parseSitemap } from "../../lib/sitemap";
import { newId, now } from "../../lib/auth";
import { siteForUser } from "../sites/sites.service";
import { refreshSuggestions } from "../links/links.service";
import { siteOrigin, startTitleJobs } from "../crawl/crawl.service";
import type { Env } from "../../types";
import { and, desc, eq, sql } from "drizzle-orm";
import { batch, changes, db, knownUrls } from "../../db";
import { waitUntil } from "../../lib/background";

export const sitemap = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const MAX_URLS = 5000; // free-tier friendly cap per import
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;

sitemap.post("/sites/:id/import-sitemap", async (c) => {
  const site = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in site) return c.json({ error: site.error }, site.status as 403 | 404);

  const body = await c.req.json().catch(() => ({}));
  const sitemapUrl =
    (body?.sitemapUrl as string | undefined) ?? `${siteOrigin(site.site.domain)}/sitemap.xml`;
  const parsedInput = isValidHttpUrl(sitemapUrl);
  if (!parsedInput) return c.json({ error: "invalid sitemap url" }, 400);

  // Fetch root sitemap
  const collected: string[] = [];
  let toFetch = [parsedInput.toString()];
  const seen = new Set<string>();
  let hops = 0;
  let rootError = null as string | null; // why the sitemap itself couldn't be read (set inside the fetches)

  while (toFetch.length && collected.length < MAX_URLS && hops < 12) {
    const batch = toFetch.splice(0, 5);
    hops++;
    const root = hops === 1;
    const docs = await Promise.all(
      batch.map(async (u) => {
        try {
          const res = await fetch(u, {
            redirect: "follow",
            headers: { "User-Agent": "404less-bot/0.1 (+https://404less.com)" },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            if (root) rootError = `${u} responded with HTTP ${res.status}`;
            return null;
          }
          const text = await res.text();
          if (text.length > MAX_SITEMAP_BYTES) {
            if (root) rootError = `${u} is larger than 5 MB`;
            return null;
          }
          return parseSitemap(text);
        } catch {
          if (root) rootError = `could not fetch ${u}`;
          return null;
        }
      }),
    );
    for (const doc of docs) {
      if (!doc) continue;
      collected.push(...doc.urls);
      for (const s of doc.sitemaps) {
        if (!seen.has(s) && seen.size < 50) {
          seen.add(s);
          toFetch.push(s);
        }
      }
    }
  }

  if (rootError) return c.json({ error: rootError }, 422);

  // Keep only same-host URLs, dedupe (the domain carries the port, if any)
  const host = site.site.domain.replace(/^www\./, "");
  const rows = new Map<string, string>(); // url -> id
  let onSite = 0;
  for (const u of collected) {
    const parsed = isValidHttpUrl(u);
    if (!parsed) continue;
    const h = parsed.host.replace(/^www\./, "");
    if (h !== host) continue;
    onSite++;
    if (parsed.hash || parsed.search) continue; // canonical pages only
    rows.set(parsed.toString(), newId());
    if (rows.size >= MAX_URLS) break;
  }

  if (!rows.size) {
    return c.json(
      {
        error: !collected.length
          ? "no page URLs found in the sitemap (is it a <urlset> or <sitemapindex>?)"
          : !onSite
            ? `none of the ${collected.length} URLs in the sitemap are on ${site.site.domain}`
            : `all ${onSite} URLs on ${site.site.domain} carry a query string or #fragment; only canonical pages are imported`,
      },
      422,
    );
  }

  // Insert in chunks (D1 batch limits)
  const ts = now();
  let inserted = 0;
  const entries = [...rows.entries()];
  for (let i = 0; i < entries.length; i += 50) {
    // one statement per row: D1 caps bound parameters per statement at 100
    const stmts = entries.slice(i, i + 50).map(([url, id]) =>
      db
        .insert(knownUrls)
        .values({ id, website_id: site.site.id, url, title: null, source: "sitemap", added_at: ts })
        .onConflictDoNothing({ target: [knownUrls.website_id, knownUrls.url] }),
    );
    const results = await batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
    inserted += results.reduce((n: number, r) => n + changes(r), 0);
  }

  // new pages may be better matches for links already open; their titles arrive in the background
  waitUntil(
    c,
    refreshSuggestions(c.env, site.site.id).catch(() => {}),
  );
  const [titles] = await startTitleJobs(c.env, [site.site.id]);
  waitUntil(
    c,
    c.env.CRAWLQ.send(titles).catch(() => {}),
  );
  return c.json({ ok: true, imported: rows.size, inserted });
});

sitemap.get("/sites/:id/known-urls", async (c) => {
  const site = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const q = c.req.query("q")?.toLowerCase();
  const columns = {
    url: knownUrls.url,
    title: knownUrls.title,
    title_checked_at: knownUrls.title_checked_at,
    source: knownUrls.source,
    added_at: knownUrls.added_at,
  };
  const ofSite = eq(knownUrls.website_id, site.site.id);
  const rows = await db
    .select(columns)
    .from(knownUrls)
    .where(
      q
        ? and(
            ofSite,
            sql`(instr(lower(${knownUrls.url}), ${q}) > 0 OR instr(lower(coalesce(${knownUrls.title}, '')), ${q}) > 0)`,
          )
        : ofSite,
    )
    .orderBy(desc(knownUrls.added_at))
    .limit(limit);
  const stats = await db
    .select({
      total: sql<number>`COUNT(*)`,
      crawled: sql<number>`SUM(CASE WHEN ${knownUrls.source} = 'crawl' THEN 1 ELSE 0 END)`,
      from_sitemap: sql<number>`SUM(CASE WHEN ${knownUrls.source} = 'sitemap' THEN 1 ELSE 0 END)`,
      titled: sql<number>`SUM(CASE WHEN ${knownUrls.title} IS NOT NULL THEN 1 ELSE 0 END)`,
      last_added: sql<number | null>`MAX(${knownUrls.added_at})`,
    })
    .from(knownUrls)
    .where(ofSite)
    .get();
  return c.json({ knownUrls: rows, stats });
});
