// Apex + HTTPS for the public site. Local dev hosts are left on http.
// www.404less.com is the only host folded to the apex; a self-hoster's own
// domain is not rewritten. Non-GET/HEAD uses 308 so a form POST keeps its body.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isLocalHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  const name = trimmed.startsWith("[")
    ? trimmed.slice(1, trimmed.indexOf("]"))
    : trimmed.replace(/:\d+$/, "");
  return LOCAL_HOSTS.has(name) || name.endsWith(".localhost");
}

export function canonicalRedirect(
  requestUrl: string,
  method: string,
  hostHeader?: string | null,
  cfRay?: string | null,
): { url: string; status: 301 | 308 } | null {
  // Production Cloudflare sets CF-Ray. `wrangler dev` does not, and it also
  // rewrites request.url to the custom domain (http://404less.com) so a redirect
  // back to https would loop on the local server. Local hosts are skipped too.
  if (!cfRay) return null;
  if (hostHeader && isLocalHost(hostHeader)) return null;
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const local = isLocalHost(host);
  let changed = false;
  if (!local && url.protocol === "http:") {
    url.protocol = "https:";
    changed = true;
  }
  if (host === "www.404less.com") {
    url.hostname = "404less.com";
    url.protocol = "https:";
    changed = true;
  }
  if (!changed) return null;
  const status = method === "GET" || method === "HEAD" ? 301 : 308;
  return { url: url.toString(), status };
}
