// A short public crawl. Reuses the product's link extractor, robots parser and
// checkUrl, but never writes D1 and never requests a private address.
// One request fetches a few pages (Workers Free allows 50 subrequests); the
// browser sends the queue back until the page cap or the queue is empty.
import { checkUrl } from "../crawl/checker";
import { extractLinks, pageTitle } from "../crawl/html";
import { parseRobots, type Robots } from "../crawl/robots";
import { isAlwaysIgnored } from "../../lib/ignored-urls";
import { followHops, redirectFlags } from "./chain";
import {
  assertPublicUrl,
  FetchBudgetSpent,
  readLimited,
  safeFetch,
  ToolInputError,
  UnsafeUrlError,
} from "./ssrf";

const PAGE_BATCH = 4;
const CHECK_BATCH = 8;
export const MAX_SCAN_PAGES = 80;
const DEFAULT_PAGES = 60;
const SKIP_CRAWL =
  /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|eot|avif|xml|txt|json)$/i;

export type ScanState = {
  queue: string[];
  seen: string[];
  checked: string[];
  pages: number;
};

export type ScanResult = {
  done: boolean;
  pagesFetched: number;
  pageCap: number;
  state: ScanState;
  pages: { url: string; status: number; title: string | null }[];
  broken: { url: string; status: number; foundOn: string | null }[];
  chains: {
    url: string;
    foundOn: string | null;
    hops: { url: string; status: number }[];
    flags: string[];
  }[];
  notes: string[];
};

const robotsCache = new Map<string, { at: number; robots: Robots }>();

export function clearScanCache(): void {
  robotsCache.clear();
}

export async function scanChunk(input: unknown): Promise<ScanResult> {
  if (!input || typeof input !== "object") throw new ToolInputError("Send a URL to scan.");
  const body = input as Record<string, unknown>;
  if (typeof body.url !== "string" || !body.url.trim())
    throw new ToolInputError("Enter a URL to scan.");
  const start = await assertPublicUrl(body.url.trim());
  const maxPages = clamp(body.maxPages, DEFAULT_PAGES, 1, MAX_SCAN_PAGES);
  const stateIn =
    body.state && typeof body.state === "object" ? (body.state as Record<string, unknown>) : {};
  const host = start.host.replace(/^www\./, "");
  const queue = strings(stateIn.queue, 80).filter((url) => sameHost(url, host));
  const seen = new Set(strings(stateIn.seen, 200));
  const checked = new Set(strings(stateIn.checked, 400));
  let pages = clamp(stateIn.pages, 0, 0, MAX_SCAN_PAGES);
  if (!queue.length && pages === 0 && seen.size === 0) queue.push(start.toString());

  const notes: string[] = [];
  const robots = await loadRobots(start.origin, notes);
  const broken: ScanResult["broken"] = [];
  const chains: ScanResult["chains"] = [];
  const pageRows: ScanResult["pages"] = [];
  const deadline = Date.now() + 16_000;
  let fetched = 0;
  let mentionedRobots = false;

  while (queue.length && fetched < PAGE_BATCH && pages < maxPages && Date.now() < deadline) {
    const next = queue.shift()!;
    const key = canon(next);
    if (seen.has(key)) continue;
    let parsed: URL;
    try {
      parsed = await assertPublicUrl(next);
    } catch (error) {
      if (error instanceof FetchBudgetSpent) throw error;
      continue;
    }
    if (!sameHost(parsed.toString(), host)) continue;
    seen.add(key);
    if (!robots.allowed(parsed.pathname)) {
      if (!mentionedRobots) {
        notes.push("Skipped paths robots.txt disallows.");
        mentionedRobots = true;
      }
      continue;
    }
    if (SKIP_CRAWL.test(parsed.pathname)) continue;

    pages += 1;
    fetched += 1;
    checked.add(parsed.toString());
    let followed;
    try {
      followed = await followHops(parsed.toString(), {
        readBody: true,
        timeoutMs: 6_000,
        maxHops: 4,
      });
    } catch (error) {
      if (error instanceof FetchBudgetSpent) break;
      broken.push({ url: parsed.toString(), status: 0, foundOn: null });
      continue;
    }
    if (followed.status === 0) {
      broken.push({ url: parsed.toString(), status: 0, foundOn: null });
      continue;
    }
    pageRows.push({
      url: followed.finalUrl,
      status: followed.status,
      title: pageTitle(followed.body),
    });
    if (followed.status >= 400 && followed.status !== 401 && followed.status !== 429) {
      broken.push({ url: parsed.toString(), status: followed.status, foundOn: null });
    }
    if (followed.flags.length) {
      chains.push({
        url: parsed.toString(),
        foundOn: null,
        hops: followed.hops.map((hop) => ({ url: hop.url, status: hop.status })),
        flags: followed.flags,
      });
    }
    if (followed.status < 200 || followed.status >= 300 || !followed.body) continue;

    const { links, assets } = extractLinks(followed.finalUrl, followed.body);
    for (const link of links) {
      let linked: URL;
      try {
        linked = new URL(link.url);
      } catch {
        continue;
      }
      linked.hash = "";
      if (!sameHost(linked.toString(), host) || linked.search || SKIP_CRAWL.test(linked.pathname))
        continue;
      if (isAlwaysIgnored(linked.toString())) continue;
      const id = canon(linked.toString());
      if (seen.has(id) || queue.includes(linked.toString()) || queue.length >= 80) continue;
      queue.push(linked.toString());
    }

    const candidates = [...links.map((link) => link.url), ...assets]
      .filter((url) => !checked.has(url) && !isAlwaysIgnored(url))
      .slice(0, CHECK_BATCH);
    await pool(candidates, 4, async (raw) => {
      if (Date.now() > deadline) return;
      checked.add(raw);
      try {
        const result = await checkUrl(raw, { ignore_status_codes: "[]" }, safeFetch, 5_000);
        if (!result.ok)
          broken.push({ url: raw, status: result.status, foundOn: followed.finalUrl });
        if (result.redirectChain) {
          const flags = redirectFlags(result.redirectChain);
          if (flags.length) {
            chains.push({
              url: raw,
              foundOn: followed.finalUrl,
              hops: result.redirectChain,
              flags,
            });
          }
        }
      } catch (error) {
        if (error instanceof FetchBudgetSpent) return;
        if (error instanceof UnsafeUrlError) return;
      }
    });
  }

  const done = queue.length === 0 || pages >= maxPages;
  if (pages >= maxPages) notes.push(`Stopped at ${maxPages} pages.`);
  return {
    done,
    pagesFetched: pages,
    pageCap: maxPages,
    state: {
      queue: queue.slice(0, 80),
      seen: [...seen].slice(0, 200),
      checked: [...checked].slice(0, 400),
      pages,
    },
    pages: pageRows,
    broken: dedupe(broken),
    chains,
    notes: [...new Set(notes)].slice(0, 8),
  };
}

async function loadRobots(origin: string, notes: string[]): Promise<Robots> {
  const hit = robotsCache.get(origin);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.robots;
  try {
    const res = await safeFetch(new URL("/robots.txt", origin).toString(), {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      if (res.status >= 500) notes.push("robots.txt did not load, so pages were crawled anyway.");
      const allow: Robots = { allowed: () => true };
      if (res.status < 500) robotsCache.set(origin, { at: Date.now(), robots: allow });
      return allow;
    }
    const robots = parseRobots(origin, await readLimited(res, 64 * 1024));
    robotsCache.set(origin, { at: Date.now(), robots });
    return robots;
  } catch (error) {
    if (error instanceof FetchBudgetSpent || error instanceof UnsafeUrlError) throw error;
    notes.push("robots.txt did not load, so pages were crawled anyway.");
    return { allowed: () => true };
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (!items.length) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length < 2000)
    .slice(0, max);
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sameHost(url: string, host: string): boolean {
  try {
    return new URL(url).host.replace(/^www\./, "") === host;
  } catch {
    return false;
  }
}

function canon(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function dedupe(rows: ScanResult["broken"]): ScanResult["broken"] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.url} ${row.foundOn ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
