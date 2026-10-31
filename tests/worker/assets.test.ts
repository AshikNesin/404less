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

test("a trailing slash on a page redirects to the page", async () => {
  const res = await worker.fetch(
    new Request("http://localhost/embed/"),
    { ...env, ASSETS } as never,
    createExecutionContext(),
  );
  expect(res.status).toBe(301);
  expect(res.headers.get("Location")).toBe("/embed");
});
