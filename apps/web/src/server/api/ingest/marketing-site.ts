// The marketing site's own 404 runs the public embed with a fixed site key
// (`404less-site`) so the demo works on a fresh database. Suggestions are the
// real ranker over this site's pages. Hits are kept in the kv table (last 100)
// until someone sets MARKETING_SITE_KEY to a real site key, which makes the
// embed use the normal per-site pipeline instead.
import { createNamespaceKv } from "@groot/core/kv";
import type { Env } from "../../types";
import { rankSuggestions, type Suggestion } from "../../lib/suggest";

export const MARKETING_SITE_KEY = "404less-site";

const PAGES: { path: string; title: string }[] = [
  { path: "/", title: "404less" },
  { path: "/embed", title: "Embed the snippet" },
  { path: "/self-host", title: "Self-host on Cloudflare" },
  { path: "/agent", title: "Agents and MCP" },
];

const HITS_KEY = "hits";
const MAX_HITS = 100;

export function marketingSuggestions(
  pageUrl: string,
  limit: number,
): { suggestions: Suggestion[]; home: string } {
  let origin = "https://404less.com";
  try {
    const parsed = new URL(pageUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") origin = parsed.origin;
  } catch {
    // keep the public origin; rankSuggestions returns nothing for a bad URL
  }
  const known = PAGES.map((page) => ({
    url: origin + (page.path === "/" ? "/" : page.path),
    title: page.title,
  }));
  const home = `${origin}/`;
  const ranked = rankSuggestions(pageUrl, known, limit, 0.2);
  if (ranked.length) return { suggestions: ranked, home };
  // Four pages total: a random miss still gets the closest real pages.
  return { suggestions: rankSuggestions(pageUrl, known, limit, 0), home };
}

type Hit = { url: string; referrer: string | null; ts: number };

/** Rate-limited ring buffer. The embed treats `{ ok: true }` as logged. */
export async function recordMarketingHit(
  env: Env,
  url: string,
  referrer: string | null,
): Promise<{ ok: true; limited?: true }> {
  const rl = env.RATELIMIT.get(env.RATELIMIT.idFromName("marketing-404"));
  const verdict = await rl.fetch("https://ratelimit/marketing-404/check", { method: "POST" });
  if (verdict.status === 429) return { ok: true, limited: true };
  const store = createNamespaceKv("marketing-404");
  const prev = (await store.get<Hit[]>(HITS_KEY)) ?? [];
  await store.set(HITS_KEY, [...prev, { url, referrer, ts: Date.now() }].slice(-MAX_HITS));
  return { ok: true };
}
