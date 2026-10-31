// Public ingest endpoints used by the embed script.
import { Hono } from "hono";
import { siteFilters } from "../sites/sites.service";
import { recordVisitorHit, suggestFor } from "../links/links.service";
import { siteOrigin } from "../crawl/crawl.service";
import { urlMatchesPattern } from "../../lib/suggest";
import { isAlwaysIgnored } from "../../lib/ignored-urls";
import type { Env } from "../../types";
import { eq } from "drizzle-orm";
import { db, notFoundEvents, websites } from "../../db";
import { waitUntil } from "../../lib/background";

export const ingest = new Hono<{ Bindings: Env }>();

ingest.post("/track", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.siteKey || !body?.url || typeof body.url !== "string")
    return c.json({ error: "bad request" }, 400);
  const site = await db
    .select({
      id: websites.id,
      domain: websites.domain,
      ignore_status_codes: websites.ignore_status_codes,
      exclude_patterns: websites.exclude_patterns,
    })
    .from(websites)
    .where(eq(websites.site_key, String(body.siteKey)))
    .get();
  if (!site) return c.json({ error: "unknown site" }, 404);

  // URL must be absolute http(s); strip fragments (never sent to servers, never a distinct page)
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return c.json({ error: "bad url" }, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return c.json({ error: "bad url" }, 400);
  parsed.hash = "";
  const url = parsed.toString().slice(0, 2000);
  const referrer =
    typeof body.referrer === "string" && body.referrer ? body.referrer.slice(0, 2000) : null;
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 300) : null;

  // Per-site rate limit (protects the free-tier D1 write budget)
  const rl = c.env.RATELIMIT.get(c.env.RATELIMIT.idFromName(site.id));
  const verdict = await rl.fetch(`https://ratelimit/${site.id}/check`, { method: "POST" });
  if (verdict.status === 429) return c.json({ ok: true, limited: true });

  // Built-in ignores (lib/ignored-urls.ts) and per-site exclusions: drop the event.
  const { excludes } = siteFilters(site);
  if (isAlwaysIgnored(url) || excludes.some((p) => urlMatchesPattern(url, p)))
    return c.json({ ok: true, ignored: true });

  const ts = Date.now();
  await db.insert(notFoundEvents).values({
    id: crypto.randomUUID(),
    website_id: site.id,
    url,
    referrer,
    user_agent: c.req.header("User-Agent")?.slice(0, 500) ?? null,
    ts,
    title,
  });
  const outcome = await recordVisitorHit(c.env, site.id, url, ts, title);

  // Ignored links are still counted, but never alert. Everything else goes to the
  // per-site digest DO, which groups hits per URL and flushes once per window.
  if (outcome.status !== "ignored") {
    const doStub = c.env.DIGEST.get(c.env.DIGEST.idFromName(site.id));
    waitUntil(
      c,
      doStub.fetch("https://digest/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ts, referrer }),
      }),
    );
  }
  return c.json({ ok: true });
});

ingest.get("/suggestions", async (c) => {
  const siteKey = c.req.query("site");
  const url = c.req.query("url");
  if (!siteKey || !url) return c.json({ error: "bad request" }, 400);
  const site = await db
    .select({ id: websites.id, domain: websites.domain })
    .from(websites)
    .where(eq(websites.site_key, siteKey))
    .get();
  if (!site) return c.json({ error: "unknown site" }, 404);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 3) || 3, 1), 5);
  const suggestions = await suggestFor(c.env, site.id, url, limit);
  c.header("Cache-Control", "public, max-age=300");
  // same scheme choice as the crawler: loopback/private hosts are plain http
  return c.json({ suggestions, home: `${siteOrigin(site.domain)}/` });
});
