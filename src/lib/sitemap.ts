// Dependency-free sitemap.xml parsing (workerd has no DOMParser).
// Handles <urlset> and <sitemapindex> documents.

export type ParsedSitemap = {
  urls: string[];      // page URLs from <url><loc>
  sitemaps: string[];  // child sitemap URLs from <sitemap><loc>
};

export function parseSitemap(xml: string): ParsedSitemap {
  const urls: string[] = [];
  const sitemaps: string[] = [];

  // <urlset> entries: <url>...<loc>URL</loc>...</url>
  for (const m of xml.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/gi)) {
    const loc = m[0].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i);
    if (loc) urls.push(decodeXml(loc[1]));
  }
  // <sitemapindex> entries: <sitemap>...<loc>URL</loc>...</sitemap>
  for (const m of xml.matchAll(/<sitemap\b[^>]*>[\s\S]*?<\/sitemap>/gi)) {
    const loc = m[0].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i);
    if (loc) sitemaps.push(decodeXml(loc[1]));
  }
  return { urls, sitemaps };
}

export function isValidHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Human-readable label from a URL path: /blog/my-post/ -> "My Post". */
export function titleFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const seg = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? u.hostname;
    return decodeURIComponent(seg)
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim() || u.hostname;
  } catch {
    return raw;
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
