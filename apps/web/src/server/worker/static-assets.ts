// Static assets with explicit routing (html_handling is off in wrangler.jsonc):
//   /app, /app/*           → the SPA shell (app.html), client-side routed
//   /foo, /guides/bar      → foo.html / guides/bar.html, else the site's 404 page
// A trailing slash on a marketing path redirects to the path without it.
// Workers only: reads the ASSETS binding per request; without one (Node) it
// falls through. Mounted last (app.ts).
import { Hono } from "hono";
import type { AppBindings } from "../types";

export const staticAssets = new Hono<AppBindings>();

staticAssets.get("*", async (c, next) => {
  const assets = c.env?.ASSETS;
  // no ASSETS binding (Node): fall through to the runtime's own static serving / 404
  if (!assets) {
    await next();
    return;
  }
  const url = new URL(c.req.url);
  const fetchAsset = (p: string) =>
    assets.fetch(
      new Request(new URL(p, url.origin), { headers: c.req.raw.headers }) as never,
    ) as unknown as Promise<Response>;
  if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
    const res = await fetchAsset("/app.html");
    // 304 (If-None-Match): the browser's cached copy is app.html already; rewrapping it as 200 would serve an empty page
    if (res.status === 304) return res;
    return new Response(res.body, { status: 200, headers: res.headers });
  }
  // /embed and /guides/netlify-redirects-not-working. No dots, so assets are not rewritten.
  const marketingPage = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/;
  // trailing slash on a marketing page (/embed/ → /embed, /guides/foo/ → /guides/foo)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const bare = url.pathname.slice(0, -1);
    if (marketingPage.test(bare)) return c.redirect(bare + url.search, 301);
  }
  // marketing pages: / → index.html, /embed → embed.html, /guides/foo → /guides/foo.html
  const page =
    url.pathname === "/"
      ? "/index.html"
      : marketingPage.test(url.pathname)
        ? `${url.pathname}.html`
        : null;
  if (page) {
    const res = await fetchAsset(page);
    if (res.ok || res.status === 304) return res;
  }
  // no conditional headers: a 304 can't carry the 404 status, and its empty body would replace the page
  const nf = (await assets.fetch(
    new Request(new URL("/404.html", url.origin)) as never,
  )) as unknown as Response;
  return new Response(nf.body, { status: 404, headers: nf.headers });
});
