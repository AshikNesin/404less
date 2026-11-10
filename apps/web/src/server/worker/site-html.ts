// Injects optional analytics into marketing HTML as the Worker serves it, and
// swaps the 404 demo's site key when MARKETING_SITE_KEY is set. Ids stay out
// of the repo: unset vars leave the <!--analytics--> marker in place.

import type { Env } from "../types";

const UMAMI_SRC = "https://hi.nesin.io/script.js";
const POSTHOG_HOST = "https://us.i.posthog.com";

export function decorateMarketingHtml(html: string, env: Env): string {
  let next = html;
  const snippet = analyticsSnippet(env);
  if (snippet && next.includes("<!--analytics-->")) {
    next = next.replace("<!--analytics-->", snippet);
  }
  const key = env.MARKETING_SITE_KEY?.trim();
  if (key && /^[A-Za-z0-9_-]{1,80}$/.test(key)) {
    next = next.replaceAll('data-site="404less-site"', `data-site="${key}"`);
  }
  return next;
}

export async function decorateHtmlResponse(
  res: Response,
  env: Env,
  extra?: Record<string, string>,
): Promise<Response> {
  if (res.status === 304) return res;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) {
    if (!extra) return res;
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
    return new Response(res.body, { status: res.status, headers });
  }
  const html = await res.text();
  const next = decorateMarketingHtml(html, env);
  const headers = new Headers(res.headers);
  if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  if (next !== html) {
    headers.delete("etag");
    headers.delete("content-length");
  }
  return new Response(next, { status: res.status, headers });
}

function analyticsSnippet(env: Env): string {
  const parts: string[] = [];
  const umami = env.UMAMI_WEBSITE_ID?.trim();
  if (umami && /^[A-Za-z0-9_-]{1,80}$/.test(umami)) {
    const src = httpsUrl(env.UMAMI_SRC?.trim() || UMAMI_SRC);
    if (src) {
      parts.push(`<script defer src="${esc(src)}" data-website-id="${esc(umami)}"></script>`);
    }
  }
  const posthog = env.POSTHOG_KEY?.trim();
  if (posthog && /^[A-Za-z0-9_-]{1,200}$/.test(posthog)) {
    const host = httpsOrigin(env.POSTHOG_HOST?.trim() || POSTHOG_HOST);
    if (host) parts.push(posthogSnippet(posthog, host));
  }
  return parts.join("\n");
}

function httpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function httpsOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function posthogSnippet(key: string, host: string): string {
  // persistence memory: no cookie. The key is charset-checked before this runs.
  return `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],o="capture identify".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)},capture_pageview:true,autocapture:false,persistence:"memory",disable_session_recording:true});</script>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
