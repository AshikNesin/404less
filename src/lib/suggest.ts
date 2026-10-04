// Suggestions: rank known-good URLs against a broken URL.
// Score = 0.5 * token Jaccard + 0.5 * normalized Levenshtein similarity on paths.

export type Suggestion = { url: string; title: string | null; score: number };

export function pathTokens(pathname: string): Set<string> {
  return new Set(
    pathname
      .toLowerCase()
      .replace(/\.(html?|php|aspx?)$/i, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
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
        prev[j] + 1,          // deletion
        cur[j - 1] + 1,       // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export function scoreUrl(brokenUrl: string, candidateUrl: string): number {
  let bu: URL, cu: URL;
  try {
    bu = new URL(brokenUrl);
    cu = new URL(candidateUrl);
  } catch {
    return 0;
  }
  // Same-host bonus is implicit via tokens; different site candidates score lower on host tokens
  const bt = pathTokens(bu.pathname);
  const ct = pathTokens(cu.pathname);
  let jaccard = 0;
  if (bt.size || ct.size) {
    let inter = 0;
    for (const t of bt) if (ct.has(t)) inter++;
    jaccard = inter / (bt.size + ct.size - inter);
  }
  const pa = bu.pathname.replace(/\/+$/, '');
  const pb = cu.pathname.replace(/\/+$/, '');
  const lev = levenshtein(pa, pb);
  const norm = 1 - lev / Math.max(pa.length, pb.length, 1);
  return 0.5 * jaccard + 0.5 * norm;
}

export function rankSuggestions(
  brokenUrl: string,
  known: { url: string; title: string | null }[],
  limit = 3,
  minScore = 0.2,
): Suggestion[] {
  return known
    .map((k) => ({ url: k.url, title: k.title, score: scoreUrl(brokenUrl, k.url) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Glob-ish pattern -> RegExp. Supports only `*` (any run of chars). Anchored. */
export function globToRegex(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 200) return null;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp(`^${escaped}$`, 'i');
  } catch {
    return null;
  }
}

/** Full-URL match against a pattern: plain substring, or glob if it contains *. */
export function urlMatchesPattern(url: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const re = globToRegex(pattern);
    if (re) return re.test(url);
  }
  return url.toLowerCase().includes(pattern.toLowerCase());
}
