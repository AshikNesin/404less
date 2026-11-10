// Static routing in the Worker's catch-all (src/index.ts), with a stand-in ASSETS binding
// that behaves like the real one: an ETag on every file, 304 for a matching If-None-Match.
import { env, createExecutionContext } from "cloudflare:test";
import { expect, test } from "vitest";
import worker from "../../apps/web/src/server/entry.worker";

const FILES: Record<string, string> = {
  "/app.html": '<div id="root"></div>',
  "/index.html": "home",
  "/embed.html": "embed",
  "/404.html": "not here",
  "/site.css": "body{}",
};
const etag = (p: string) => `"${p}"`;
const ASSETS = {
  fetch: async (req: Request) => {
    const path = new URL(req.url).pathname;
    if (!(path in FILES)) return new Response("nf", { status: 404 });
    if (req.headers.get("If-None-Match") === etag(path))
      return new Response(null, { status: 304, headers: { ETag: etag(path) } });
    return new Response(FILES[path], {
      headers: { ETag: etag(path), "Content-Type": "text/html" },
    });
  },
};

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { headers }),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  return { status: res.status, body: await res.text() };
}

test("dashboard routes serve the SPA shell", async () => {
  expect(await get("/app/sites/abc")).toEqual({ status: 200, body: FILES["/app.html"] });
});

test("a revisit with a cached shell gets 304, never an empty 200", async () => {
  const r = await get("/app/sites/abc", { "If-None-Match": etag("/app.html") });
  expect(r.status).toBe(304);
});

test("a revisit of a marketing page gets 304, not the 404 page", async () => {
  expect((await get("/embed", { "If-None-Match": etag("/embed.html") })).status).toBe(304);
  expect((await get("/", { "If-None-Match": etag("/index.html") })).status).toBe(304);
});

test("the 404 page keeps its body for a browser that cached it", async () => {
  expect(await get("/missing", { "If-None-Match": etag("/404.html") })).toEqual({
    status: 404,
    body: FILES["/404.html"],
  });
});

test("a static file is served, and a missing path is a real 404", async () => {
  expect(await get("/site.css")).toEqual({ status: 200, body: FILES["/site.css"] });
  const res = await worker.fetch(
    new Request("http://localhost/missing"),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(res.status).toBe(404);
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
  expect(await res.text()).toBe(FILES["/404.html"]);
});

test("http and www on the public host redirect to https://404less.com", async () => {
  const edge = { "cf-ray": "test" };
  const http = await worker.fetch(
    new Request("http://404less.com/embed?x=1", { headers: edge }),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(http.status).toBe(301);
  expect(http.headers.get("location")).toBe("https://404less.com/embed?x=1");

  const www = await worker.fetch(
    new Request("https://www.404less.com/self-host", { headers: edge }),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(www.status).toBe(301);
  expect(www.headers.get("location")).toBe("https://404less.com/self-host");

  const post = await worker.fetch(
    new Request("http://www.404less.com/api/waitlist", { method: "POST", headers: edge }),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(post.status).toBe(308);
  expect(post.headers.get("location")).toBe("https://404less.com/api/waitlist");

  const local = await worker.fetch(
    new Request("http://127.0.0.1:8787/", { headers: edge }),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(local.status).toBe(200);

  // wrangler dev has no CF-Ray; the custom-domain route must not loop
  const dev = await worker.fetch(
    new Request("http://404less.com/"),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(dev.status).toBe(200);
});

test("a trailing slash on a page redirects to the page", async () => {
  const res = await worker.fetch(
    new Request("http://localhost/embed/"),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(res.status).toBe(301);
  expect(res.headers.get("Location")).toBe("/embed");
});
