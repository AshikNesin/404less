// M4: crawler. HTML link extraction, checker classification, crawl tasks + cron tick,
// diff-based new-failure alerts, crawl report endpoint.
import {
  SELF,
  env,
  createScheduledController,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { scheduled as scheduledHandler } from "../../apps/web/src/server/worker/cron";
import { beforeAll, expect, test } from "vitest";
import { drainCrawl, siteRun, startTestRun, tasksOf, tick } from "./crawl-helpers";
import { extractLinks } from "../../apps/web/src/server/api/crawl/html";

let cookie = "";
let teamId = "";
let siteId = "";

beforeAll(async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "m4@example.com" }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "M4" }),
    })
  ).json()) as any;
  teamId = team.team.id;
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId, name: "CrawlTest", domain: "crawl.test" }),
    })
  ).json()) as any;
  siteId = site.site.id;
});

test("extractLinks: anchor text is readable, with image/label fallbacks", () => {
  const html = `
    <a href="/a">Tips &amp; Tricks
      for   <strong>Firefox</strong></a>
    <a href="/b"><img src="/logo.png" alt="Acme home"></a>
    <a href="/c" aria-label="Open settings"><svg></svg></a>
    <a href="/d" data-title="no" title="Download page"><i></i></a>
    <a href="/e"><span></span></a>`;
  const anchors = Object.fromEntries(
    extractLinks("https://crawl.test/", html).links.map((l) => [new URL(l.url).pathname, l.anchor]),
  );
  expect(anchors).toEqual({
    "/a": "Tips & Tricks for Firefox",
    "/b": "Acme home",
    "/c": "Open settings",
    "/d": "Download page",
    "/e": null,
  });
});

test("extractLinks: anchors, assets, relative resolution, junk skipped", () => {
  const html = `
    <a href="/docs/getting-started">Getting Started</a>
    <a href="https://other.example/x">External</a>
    <a href="mailto:a@b.c">mail</a>
    <a href="#anchor">skip</a>
    <a href="javascript:void(0)">skip</a>
    <img src="/img/logo.png">
    <script src="/js/app.js"></script>
    <link href="/css/site.css">`;
  const { links, assets } = extractLinks("https://crawl.test/index.html", html);
  expect(links.map((l) => l.url).sort()).toEqual([
    "https://crawl.test/docs/getting-started",
    "https://other.example/x",
  ]);
  expect(links[0].anchor).toBe("Getting Started");
  expect(assets.sort()).toEqual([
    "https://crawl.test/css/site.css",
    "https://crawl.test/img/logo.png",
    "https://crawl.test/js/app.js",
  ]);
});

function stubFetch(
  responses: Record<string, { status: number; location?: string; body?: string }>,
) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const u = String(input instanceof Request ? input.url : input);
    for (const [k, v] of Object.entries(responses)) {
      if (u === k) {
        return new Response(v.body ?? "", {
          status: v.status,
          headers: v.location ? { location: v.location } : {},
        });
      }
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

test("checkUrl follows redirects and records the chain", async () => {
  const restore = stubFetch({
    "https://crawl.test/a": { status: 301, location: "/b" },
    "https://crawl.test/b": { status: 302, location: "/c" },
    "https://crawl.test/c": { status: 200, body: "<html></html>" },
  });
  try {
    const { checkUrl } = await import("../../apps/web/src/server/api/crawl/checker");
    const r = await checkUrl("https://crawl.test/a", { ignore_status_codes: "[]" } as never);
    expect(r.status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.redirectChain).toEqual([
      { url: "https://crawl.test/a", status: 301 },
      { url: "https://crawl.test/b", status: 302 },
      { url: "https://crawl.test/c", status: 200 },
    ]);
  } finally {
    restore();
  }
});

test("checkUrl classifies broken, and ignore-list rescues 403", async () => {
  const restore = stubFetch({
    "https://crawl.test/dead": { status: 404 },
    "https://crawl.test/locked": { status: 403 },
  });
  try {
    const { checkUrl } = await import("../../apps/web/src/server/api/crawl/checker");
    expect(
      (await checkUrl("https://crawl.test/dead", { ignore_status_codes: "[]" } as never)).ok,
    ).toBe(false);
    expect(
      (await checkUrl("https://crawl.test/locked", { ignore_status_codes: "[403]" } as never)).ok,
    ).toBe(true);
  } finally {
    restore();
  }
});

test("a page task: extracts links, records sources, queues link checks + same-host pages", async () => {
  // enable crawling first
  await SELF.fetch(`http://localhost/api/v1/sites/${siteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ crawl_enabled: true, crawl_max_pages: 5 }),
  });

  const restore = stubFetch({
    "https://crawl.test/": {
      status: 200,
      body: `<html><a href="/page1">One</a><a href="https://ext.example/x">Ext</a><img src="/i.png"></html>`,
    },
  });
  try {
    await startTestRun(siteId, [{ kind: "page", url: "https://crawl.test/", depth: 0 }]);
    // room for the page (and robots.txt) only: what it queued is still waiting
    await tick({ fetches: 2 });
    const queued = (await tasksOf(siteId)).map((t) => `${t.kind} ${t.url}`);
    expect(queued).toEqual([
      "page https://crawl.test/",
      "link https://crawl.test/page1",
      "link https://ext.example/x",
      "link https://crawl.test/i.png",
      "page https://crawl.test/page1", // same-host -> crawled
    ]);
    expect((await siteRun(siteId))!.crawl_pages).toBe(2);
    const src = await env.DB.prepare("SELECT COUNT(*) AS n FROM crawl_sources WHERE website_id = ?")
      .bind(siteId)
      .first<{ n: number }>();
    expect(src!.n).toBe(3);
    await drainCrawl();
  } finally {
    restore();
  }
});

test("a link task: persists the result; a repeated failure is not new", async () => {
  const restore = stubFetch({ "https://ext.example/x": { status: 404 } });
  try {
    for (let run = 0; run < 2; run++) {
      await new Promise((r) => setTimeout(r, 5)); // each run starts after the last check
      await startTestRun(siteId, [
        { kind: "link", url: "https://ext.example/x", source_url: "https://crawl.test/" },
      ]);
      await drainCrawl();
    }
    const rows = await env.DB.prepare(
      "SELECT ok, status FROM link_checks WHERE website_id = ? AND url = ?",
    )
      .bind(siteId, "https://ext.example/x")
      .all();
    expect(rows.results).toHaveLength(3); // the page run's check + one per run here
    expect(rows.results.every((r) => r.ok === 0)).toBe(true);
  } finally {
    restore();
  }
});

test("crawl-report endpoint returns broken with sources", async () => {
  const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/crawl-report`, {
    headers: { cookie },
  });
  expect(r.status).toBe(200);
  const { broken } = (await r.json()) as any;
  expect(broken.length).toBeGreaterThan(0);
  const dead = broken.find((b: any) => b.url === "https://ext.example/x");
  expect(dead).toBeDefined();
  expect(dead.status).toBe(404);
  expect(dead.found_on).toBe("https://crawl.test/");
  expect(dead.link_status).toBe("open"); // crawler findings land in broken_links
});

test("POST /crawl starts a crawl (auth + role checked)", async () => {
  const r1 = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/crawl`, { method: "POST" });
  expect(r1.status).toBe(401);
  const restore = stubFetch({});
  try {
    const r2 = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/crawl`, {
      method: "POST",
      headers: { cookie },
    });
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as any).started).toBe(true);
    expect((await siteRun(siteId))!.crawl_cursor).not.toBeNull();
    await drainCrawl();
  } finally {
    restore();
  }
});

test("the cron tick starts runs for sites with crawling on once they are due", async () => {
  const cron = async () => {
    const ctrl = createScheduledController({ scheduledTime: new Date(0), cron: "* * * * *" });
    const ctx = createExecutionContext();
    await scheduledHandler(ctrl, env as never, ctx);
    await waitOnExecutionContext(ctx);
  };
  const setRun = (enabled: number, lastCrawlAt: number) =>
    env.DB.prepare("UPDATE websites SET crawl_enabled = ?, last_crawl_at = ? WHERE id = ?")
      .bind(enabled, lastCrawlAt, siteId)
      .run();
  const restore = stubFetch({});
  try {
    const recent = Date.now() - 60_000;
    await setRun(1, recent);
    await cron();
    expect((await siteRun(siteId))!.last_crawl_at).toBe(recent); // crawled a minute ago: not due

    await setRun(0, 1);
    await cron();
    expect((await siteRun(siteId))!.last_crawl_at).toBe(1); // crawling off: never due

    await setRun(1, Date.now() - 25 * 3_600_000);
    await cron();
    const run = await siteRun(siteId);
    expect(run!.last_crawl_at).toBeGreaterThan(recent); // a day since the last run: started
    await drainCrawl();
  } finally {
    restore();
  }
});
