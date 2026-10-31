// Dependency-free link extraction (workerd has no DOMParser).
// Pulls <a href>, <img src>, <script src>, <link href> from an HTML string.
export type ExtractedLinks = {
  links: { url: string; anchor: string | null }[]; // <a>: crawled further if same-host
  assets: string[]; // img/script/link: checked, not crawled
};

export function extractLinks(base: string, html: string): ExtractedLinks {
  const out: ExtractedLinks = { links: [], assets: [] };
  let baseU: URL;
  try {
    baseU = new URL(base);
  } catch {
    return out;
  }

  const abs = (href: string): string | null => {
    const v = decodeEntities(href.trim());
    if (!v || v.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(v)) return null;
    try {
      return new URL(v, baseU).toString();
    } catch {
      return null;
    }
  };

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(m[1]);
    if (!url) continue;
    const anchor = stripTags(m[2]).trim().slice(0, 200) || null;
    if (!out.links.some((l) => l.url === url)) out.links.push({ url, anchor });
  }
  for (const m of html.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
    const url = abs(m[1]);
    if (url && !out.assets.includes(url)) out.assets.push(url);
  }
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const url = abs(m[1]);
    if (url && !out.assets.includes(url)) out.assets.push(url);
  }
  return out;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

/** Real page title from <title> (og:title fallback); null when absent. */
export function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) {
    const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 300);
  }
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) {
    const t = decodeEntities(og[1]).replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 300);
  }
  return null;
}

const NAMED = new Map(
  Object.entries({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
    middot: "·",
    bull: "•",
    laquo: "«",
    raquo: "»",
    copy: "©",
    reg: "®",
    trade: "™",
    AMP: "&",
    LT: "<",
    GT: ">",
    QUOT: '"',
    COPY: "©",
    REG: "®",
    TRADE: "™",
  }),
);

/** Numeric (&#8211; &#x2014;) and common named entities, in one pass so &amp;lt; stays &lt;. */
function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return NAMED.get(e) ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}
