// The crawl tick's Free-plan guarantees: an idle tick writes nothing, one tick
// runs at a time, a tick stays inside its fetch budget (and running out is never
// mistaken for a broken link), a run fetches at most crawl_max_pages pages, and
// re-crawling an unchanged page rewrites nothing.
import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { drainCrawl, siteRun, startTestRun, tasksOf, tick } from "./crawl-helpers";

let cookie = "";
let siteId = "";

beforeAll(async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "tick@example.com" }),
  });
  const { devLink } = (await r.json()) as any;
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "Tick", domain: "tick.test" }),
    })
  ).json()) as any;
  siteId = site.site.id;
});

/** Serve `pages` (url → html); anything else is a 200 with no body. Records every fetch. */
function stub(pages: Record<string, string> = {}) {
  const real = globalThis.fetch;
  const fetched: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? input.url : input);
    fetched.push(u);
    return new Response(pages[u] ?? "", { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return {
    fetched,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

const lease = () =>
  env.DB.prepare("SELECT value, expires_at FROM kv WHERE key = 'crawl:tick:lease'").first();

test("a tick with nothing to do only reads", async () => {
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM kv").first<{ n: number }>();
  expect((await tick()).state).toBe("idle");
  expect(await lease()).toBeNull();
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM kv").first<{ n: number }>())!.n).toBe(
    before!.n,
  );
});

test("one tick at a time: a held lease makes the next tick wait, an expired one is taken over", async () => {
  const s = stub();
  try {
    await startTestRun(siteId, [{ kind: "link", url: "https://tick.test/a" }]);
    await env.DB.prepare(
      "INSERT INTO kv (key, value, expires_at) VALUES ('crawl:tick:lease', '\"other\"', ?)",
    )
      .bind(Date.now() + 60_000)
      .run();
    expect((await tick()).state).toBe("busy");
    expect(s.fetched).toEqual([]);

    await env.DB.prepare("UPDATE kv SET expires_at = ? WHERE key = 'crawl:tick:lease'")
      .bind(Date.now() - 1)
      .run();
    expect(await tick()).toMatchObject({ state: "ran", tasks: 1, finished: 1 });
    expect(s.fetched).toEqual(["https://tick.test/a"]);
    expect(await lease()).toBeNull(); // released
  } finally {
    s.restore();
  }
});

test("a tick stops at its fetch budget and the next carries on; no check is cut short", async () => {
  const links = Array.from({ length: 30 }, (_, i) => `https://tick.test/l/${i}`);
  const s = stub();
  try {
    await startTestRun(
      siteId,
      links.map((url) => ({ kind: "link" as const, url })),
    );
    const first = await tick({ fetches: 12 });
    expect(first.tasks).toBeLessThanOrEqual(12);
    expect(s.fetched.length).toBeLessThanOrEqual(12);
    expect((await siteRun(siteId))!.crawl_cursor).toBeGreaterThan(0);

    await drainCrawl({ fetches: 12 });
    expect(new Set(s.fetched).size).toBe(30);
    expect(s.fetched.length).toBe(30); // each link fetched once across ticks
  } finally {
    s.restore();
  }
  const zero = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM link_checks WHERE website_id = ? AND status = 0",
  )
    .bind(siteId)
    .first<{ n: number }>();
  expect(zero!.n).toBe(0); // a spent budget never reads as an unreachable link
});

test("a run fetches at most crawl_max_pages pages, discovered ones included", async () => {
  await env.DB.prepare("UPDATE websites SET crawl_max_pages = 3 WHERE id = ?").bind(siteId).run();
  const nav = Array.from({ length: 10 }, (_, i) => `<a href="/p/${i}">P${i}</a>`).join("");
  const s = stub({ "https://tick.test/": `<title>Home</title>${nav}` });
  try {
    await startTestRun(siteId, [{ kind: "page", url: "https://tick.test/", depth: 0 }]);
    await drainCrawl();
  } finally {
    s.restore();
    await env.DB.prepare("UPDATE websites SET crawl_max_pages = 100 WHERE id = ?")
      .bind(siteId)
      .run();
  }
  const pageFetches = s.fetched.filter(
    (u) => u.startsWith("https://tick.test/p/") || u === "https://tick.test/",
  );
  // the homepage + 2 discovered pages, each once; plus one check per link on the homepage
  expect(pageFetches.filter((u) => u === "https://tick.test/").length).toBe(1);
  expect(pageFetches.length - 1).toBe(10 + 2);
});

test("re-crawling reconciles a page's sources: new links added, removed links dropped", async () => {
  const sources = async () =>
    (
      await env.DB.prepare(
        "SELECT source_url, target_url, anchor FROM crawl_sources WHERE website_id = ? ORDER BY source_url, target_url",
      )
        .bind(siteId)
        .all()
    ).results;
  const run = async (home: string, about: string | null) => {
    const pages: Record<string, string> = { "https://tick.test/": home };
    if (about !== null) pages["https://tick.test/about"] = about;
    const s = stub(pages);
    try {
      await startTestRun(siteId, [
        { kind: "page", url: "https://tick.test/", depth: 0 },
        ...(about !== null
          ? [{ kind: "page" as const, url: "https://tick.test/about", depth: 0 }]
          : []),
      ]);
      await drainCrawl();
    } finally {
      s.restore();
    }
  };

  await run(
    '<a href="https://x.example/">X</a><a href="https://y.example/">Y</a>',
    '<a href="https://y.example/">Y</a>',
  );
  expect(await sources()).toEqual([
    { source_url: "https://tick.test/", target_url: "https://x.example/", anchor: "X" },
    { source_url: "https://tick.test/", target_url: "https://y.example/", anchor: "Y" },
    { source_url: "https://tick.test/about", target_url: "https://y.example/", anchor: "Y" },
  ]);

  // the homepage drops Y and links Z; /about is no longer crawled at all
  await run('<a href="https://x.example/">X</a><a href="https://z.example/">Zed</a>', null);
  expect(await sources()).toEqual([
    { source_url: "https://tick.test/", target_url: "https://x.example/", anchor: "X" },
    { source_url: "https://tick.test/", target_url: "https://z.example/", anchor: "Zed" },
  ]);
  expect(await tasksOf(siteId)).toEqual([]);
});

test("the overview reports a run as running until its last task is done", async () => {
  const overview = async () =>
    (
      (await (
        await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/overview`, {
          headers: { cookie },
        })
      ).json()) as any
    ).crawl;
  const s = stub();
  try {
    await startTestRun(siteId, [{ kind: "link", url: "https://tick.test/slow" }]);
    expect((await overview()).running).toBe(true);
    await drainCrawl();
    expect(await overview()).toMatchObject({ running: false, intervalHours: 24 });
  } finally {
    s.restore();
  }
});
