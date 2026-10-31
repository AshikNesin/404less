// Suggestions: rank known-good URLs against a broken URL.
//
// Two passes keep this inside the Workers CPU budget even with 5k known URLs:
//   1. cheap prefilter: path-token Jaccard + character-trigram Dice on the path
//   2. exact score on the shortlist: 0.5 * token Jaccard + 0.5 * normalized
//      Levenshtein similarity on the paths
// `prepareKnown` tokenizes candidates once so callers can rank many URLs
// against the same index (the links service caches it per site).

export type Suggestion = { url: string; title: string | null; score: number };

export type PreparedKnown = {
  url: string;
  title: string | null;
  host: string;
  path: string;
  tokens: Set<string>;
  grams: Set<string>;
}[];

const PREFILTER_KEEP = 60;

export function pathTokens(pathname: string): Set<string> {
  return new Set(
    pathname
      .toLowerCase()
      .replace(/\.(html?|php|aspx?)$/i, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  const p = ` ${s.toLowerCase()} `;
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  const inter = overlap(a, b);
  return inter / (a.size + b.size - inter);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // deletion
        cur[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function cleanPath(u: URL): string {
  return u.pathname.replace(/\/+$/, "") || "/";
}

function scorePaths(pa: string, ta: Set<string>, pb: string, tb: Set<string>): number {
  const lev = levenshtein(pa, pb);
  const norm = 1 - lev / Math.max(pa.length, pb.length, 1);
  return 0.5 * jaccard(ta, tb) + 0.5 * norm;
}

export function scoreUrl(brokenUrl: string, candidateUrl: string): number {
  let bu: URL, cu: URL;
  try {
    bu = new URL(brokenUrl);
    cu = new URL(candidateUrl);
  } catch {
    return 0;
  }
  return scorePaths(cleanPath(bu), pathTokens(bu.pathname), cleanPath(cu), pathTokens(cu.pathname));
}

export function prepareKnown(known: { url: string; title: string | null }[]): PreparedKnown {
  // a title three or more pages share (an SPA shell, a CMS default) says nothing about the page
  const uses = new Map<string, number>();
  for (const k of known) if (k.title) uses.set(k.title, (uses.get(k.title) ?? 0) + 1);
  const out: PreparedKnown = [];
  for (const k of known) {
    let u: URL;
    try {
      u = new URL(k.url);
    } catch {
      continue;
    }
    const path = cleanPath(u);
    const title = k.title && uses.get(k.title)! < 3 ? k.title : null;
    out.push({
      url: k.url,
      title,
      host: u.host,
      path,
      tokens: pathTokens(u.pathname),
      grams: trigrams(path),
    });
  }
  return out;
}

export function rankPrepared(
  brokenUrl: string,
  known: PreparedKnown,
  limit = 3,
  minScore = 0.2,
): Suggestion[] {
  let bu: URL;
  try {
    bu = new URL(brokenUrl);
  } catch {
    return [];
  }
  const bp = cleanPath(bu);
  const bt = pathTokens(bu.pathname);
  const bg = trigrams(bp);

  // pass 1: cheap similarity for every candidate; never suggest the broken URL itself
  const pre: { k: PreparedKnown[number]; pre: number }[] = [];
  for (const k of known) {
    if (k.path === bp && k.host === bu.host) continue;
    const dice = (2 * overlap(bg, k.grams)) / (bg.size + k.grams.size || 1);
    pre.push({ k, pre: 0.5 * jaccard(bt, k.tokens) + 0.5 * dice });
  }
  pre.sort((a, b) => b.pre - a.pre);

  // pass 2: exact score on the shortlist
  return pre
    .slice(0, PREFILTER_KEEP)
    .map(({ k }) => ({ url: k.url, title: k.title, score: scorePaths(bp, bt, k.path, k.tokens) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function rankSuggestions(
  brokenUrl: string,
  known: { url: string; title: string | null }[],
  limit = 3,
  minScore = 0.2,
): Suggestion[] {
  return rankPrepared(brokenUrl, prepareKnown(known), limit, minScore);
}

/** Glob-ish pattern -> RegExp. Supports only `*` (any run of chars). Anchored. */
export function globToRegex(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 200) return null;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`, "i");
  } catch {
    return null;
  }
}

/** Full-URL match against a pattern: plain substring, or glob if it contains *. */
export function urlMatchesPattern(url: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const re = globToRegex(pattern);
    if (re) return re.test(url);
  }
  return url.toLowerCase().includes(pattern.toLowerCase());
}
