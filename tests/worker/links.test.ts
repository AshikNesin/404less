// Broken-link triage: the lifecycle both detectors drive (open → resolved → reopened,
// ignored stays quiet), the list/detail/status endpoints, overview stats, site delete.
import {
  SELF,
  env,
  createExecutionContext,
  waitOnExecutionContext,
  createMessageBatch,
} from "cloudflare:test";
import { queue as queueHandler } from "../../apps/web/src/server/worker/cron";
import { beforeAll, expect, test } from "vitest";

let cookie = "";
let siteId = "";
let siteKey = "";
const h = () => ({ "Content-Type": "application/json", cookie });

async function track(url: string, referrer: string | null = null, title: string | null = null) {
  const r = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteKey, url, referrer, title }),
  });
  expect(r.status).toBe(200);
  return r.json() as Promise<any>;
}

async function list(qs = "") {
  const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links${qs}`, {
    headers: { cookie },
  });
  expect(r.status).toBe(200);
  return r.json() as Promise<any>;
}

function stubFetch(responses: Record<string, number>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u in responses) return new Response("", { status: responses[u] });
    return real(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

beforeAll(async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "links@example.com" }),
  });
  const { devLink } = (await r.json()) as any;
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ name: "Links", domain: "links.test" }),
    })
  ).json()) as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
  // known pages so suggestions have something to rank
  for (const u of [
    "https://links.test/docs/getting-started",
    "https://links.test/docs/install",
    "https://links.test/pricing",
  ]) {
    await env.DB.prepare(
      "INSERT INTO known_urls (id, website_id, url, title, source, added_at) VALUES (?, ?, ?, ?, 'sitemap', ?)",
    )
      .bind(crypto.randomUUID(), siteId, u, u.split("/").pop(), Date.now())
      .run();
  }
});

test("visitor hits open one link per url, count hits, carry a suggested fix", async () => {
  await track("https://links.test/docs/instal", "https://links.test/");
  await track("https://links.test/docs/instal#frag", "https://google.com/");
  await track("https://links.test/old-pricing");
  const { links, counts, total } = await list();
  expect(total).toBe(2);
  expect(counts.open).toBe(2);
  const instal = links.find((l: any) => l.url === "https://links.test/docs/instal");
  expect(instal.hits).toBe(2); // fragment stripped → same url
  expect(instal.source).toBe("visitor");
  expect(instal.suggested_url).toBe("https://links.test/docs/install");
  expect(links[0].url).toBe("https://links.test/docs/instal"); // default sort: hits desc
});

test("list: filters, search, sort, pagination", async () => {
  expect((await list("?q=pricing")).links.map((l: any) => l.url)).toEqual([
    "https://links.test/old-pricing",
  ]);
  expect((await list("?source=crawler")).total).toBe(0);
  const page = await list("?limit=1&page=2&sort=first_seen");
  expect(page.links).toHaveLength(1);
  expect(page.total).toBe(2);
  expect(page.page).toBe(2);
  expect((await list("?status=resolved")).total).toBe(0);
});

test("detail: referrers, series, suggestions", async () => {
  const { links } = await list();
  const id = links.find((l: any) => l.url === "https://links.test/docs/instal").id;
  const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links/${id}`, {
    headers: { cookie },
  });
  expect(r.status).toBe(200);
  const d = (await r.json()) as any;
  expect(d.link.id).toBe(id);
  expect(d.referrers.map((x: any) => x.referrer).sort()).toEqual([
    "https://google.com/",
    "https://links.test/",
  ]);
  expect(d.series).toHaveLength(30);
  expect(d.series[29].hits).toBe(2); // today
  expect(d.suggestions[0].url).toBe("https://links.test/docs/install");
  expect(d.recent).toHaveLength(2);
  const missing = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links/nope`, {
    headers: { cookie },
  });
  expect(missing.status).toBe(404);
});

test("status: resolve → visitor hit reopens; ignore → counted but never alerts", async () => {
  const { links } = await list();
  const instal = links.find((l: any) => l.url === "https://links.test/docs/instal");
  const pricing = links.find((l: any) => l.url === "https://links.test/old-pricing");

  const bad = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
    method: "PATCH",
    headers: h(),
    body: JSON.stringify({ ids: [instal.id], status: "gone" }),
  });
  expect(bad.status).toBe(400);

  const ok = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
    method: "PATCH",
    headers: h(),
    body: JSON.stringify({ ids: [instal.id, pricing.id], status: "resolved" }),
  });
  expect(((await ok.json()) as any).changed).toBe(2);
  expect((await list()).counts).toEqual({ open: 0, resolved: 2, ignored: 0 });

  await track("https://links.test/docs/instal");
  const after = await list("?status=all");
  expect(after.links.find((l: any) => l.id === instal.id).status).toBe("open"); // reopened
  expect(after.links.find((l: any) => l.id === instal.id).hits).toBe(3);
  expect(after.links.find((l: any) => l.id === pricing.id).status).toBe("resolved");

  // ignore: hits still counted, digest DO never told
  await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
    method: "PATCH",
    headers: h(),
    body: JSON.stringify({ ids: [pricing.id], status: "ignored" }),
  });
  const doStub = (env as any).DIGEST.get((env as any).DIGEST.idFromName(siteId));
  await doStub.fetch("https://digest/flush", { method: "POST" }); // clear anything buffered so far
  await track("https://links.test/old-pricing");
  await new Promise((r) => setTimeout(r, 100));
  const row = (await list("?status=ignored")).links[0];
  expect(row.url).toBe("https://links.test/old-pricing");
  expect(row.hits).toBe(2);
  expect(row.status).toBe("ignored");
});

test("crawler: failure creates a crawler-source link, success resolves an open one", async () => {
  const sent: any[] = [];
  const realSend = (env as any).CRAWLQ.sendBatch.bind(env.CRAWLQ);
  (env as any).CRAWLQ.sendBatch = async (msgs: any[]) => {
    sent.push(...msgs.map((m) => m.body));
  };
  const restore = stubFetch({
    "https://links.test/missing.png": 404,
    "https://links.test/docs/instal": 200,
  });
  try {
    const run = async (body: any) => {
      const batch = createMessageBatch("crawl-q", [
        { id: crypto.randomUUID(), timestamp: new Date(0), attempts: 1, body } as never,
      ]);
      const ctx = createExecutionContext();
      await queueHandler(batch, env as never, ctx);
      await waitOnExecutionContext(ctx);
    };
    // crawl-site with crawling off but manual=true still starts; seeds known urls + rechecks open links
    await run({ kind: "crawl-site", siteId, manual: true });
    expect(sent.some((m) => m.kind === "fetch-page")).toBe(true);
    expect(
      sent.some((m) => m.kind === "check-link" && m.url === "https://links.test/docs/instal"),
    ).toBe(true);
    const site = await env.DB.prepare("SELECT last_crawl_at FROM websites WHERE id = ?")
      .bind(siteId)
      .first<{ last_crawl_at: number }>();
    expect(site!.last_crawl_at).toBeGreaterThan(0);

    await run({
      kind: "check-link",
      siteId,
      url: "https://links.test/missing.png",
      sourceUrl: "https://links.test/",
    });
    await run({
      kind: "check-link",
      siteId,
      url: "https://links.test/docs/instal",
      sourceUrl: "https://links.test/",
    });

    const all = await list("?status=all");
    const png = all.links.find((l: any) => l.url === "https://links.test/missing.png");
    expect(png.source).toBe("crawler");
    expect(png.http_status).toBe(404);
    expect(png.status).toBe("open");
    expect(png.hits).toBe(0);
    const instal = all.links.find((l: any) => l.url === "https://links.test/docs/instal");
    expect(instal.status).toBe("resolved"); // crawler verified it works again
    expect(instal.http_status).toBe(200);
    expect((await list("?source=crawler")).links.map((l: any) => l.url)).toEqual([
      "https://links.test/missing.png",
    ]);
  } finally {
    restore();
    (env as any).CRAWLQ.sendBatch = realSend;
  }
});

test("recheck endpoint applies a live check", async () => {
  const png = (await list("?source=crawler")).links[0];
  const restore = stubFetch({ "https://links.test/missing.png": 200 });
  try {
    const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links/${png.id}/check`, {
      method: "POST",
      headers: h(),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.httpStatus).toBe(200);
    expect(body.status).toBe("resolved");
  } finally {
    restore();
  }
});

test("overview: counts, series, top open, crawl summary; links csv", async () => {
  const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/overview`, {
    headers: { cookie },
  });
  expect(r.status).toBe(200);
  const o = (await r.json()) as any;
  expect(o.counts.open + o.counts.resolved + o.counts.ignored).toBe(3);
  expect(o.series).toHaveLength(30);
  expect(o.hits7d).toBe(5);
  expect(o.crawl.lastCrawlAt).toBeGreaterThan(0);
  expect(o.crawl.checked).toBeGreaterThanOrEqual(2);
  expect(o.knownUrls).toBe(3);

  const sites = (await (
    await SELF.fetch("http://localhost/api/v1/sites", { headers: { cookie } })
  ).json()) as any;
  const s = sites.sites.find((x: any) => x.id === siteId);
  expect(s.hits_7d).toBe(5);
  expect(typeof s.open_links).toBe("number");

  const csv = await (
    await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links.csv?status=all`, {
      headers: { cookie },
    })
  ).text();
  expect(csv.split("\n")[0]).toBe(
    "url,title,status,source,hits,http_status,first_seen,last_seen,found_on,suggested_url",
  );
  expect(csv).toContain("https://links.test/old-pricing,,ignored,visitor,2");
});

test("titles: the 404 page title a visitor saw is stored on the event and the link", async () => {
  await track("https://links.test/legacy/download", "https://links.test/", "Page not found · Acme");
  const event = await env.DB.prepare(
    "SELECT title FROM not_found_events WHERE url = 'https://links.test/legacy/download' ORDER BY ts DESC LIMIT 1",
  ).first<{ title: string | null }>();
  expect(event!.title).toBe("Page not found · Acme");
  const { links } = await list("?status=all");
  const row = links.find((l: any) => l.url === "https://links.test/legacy/download");
  expect(row.title).toBe("Page not found · Acme");
});

test("delete site removes everything, viewers and strangers cannot", async () => {
  const stranger = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}`, {
    method: "DELETE",
  });
  expect(stranger.status).toBe(401);
  const r = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(r.status).toBe(200);
  for (const t of ["websites", "broken_links", "not_found_events", "known_urls", "link_checks"]) {
    const col = t === "websites" ? "id" : "website_id";
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = ?`)
      .bind(siteId)
      .first<{ n: number }>();
    expect(n!.n).toBe(0);
  }
  const gone = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
    headers: { cookie },
  });
  expect(gone.status).toBe(404);
});
