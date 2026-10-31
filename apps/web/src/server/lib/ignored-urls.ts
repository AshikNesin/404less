// URLs that are never a site's own broken link, for every site. The widget
// drops them before they're recorded and the crawler never checks them.

/** Path prefixes ignored everywhere (matched on the URL's path, any host). */
const IGNORED_PATH_PREFIXES = [
  // Cloudflare email obfuscation: rewrites mailto links to this path, which
  // 404s for visitors and crawlers without JavaScript.
  "/cdn-cgi/l/email-protection",
];

export function isAlwaysIgnored(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  return IGNORED_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
