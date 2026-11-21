// The live demo: /app/demo signs anyone in to one shared, read-only account
// whose sample data is written on first visit and refreshed when stale.
// Demo sites take no visitor hits and are never crawled.
import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { tick } from "./crawl-helpers";
import {
  DEMO_RESEED_MS,
  DEMO_SITE_ID,
  demoEnabled,
} from "../../apps/web/src/server/api/demo/demo.service";

let cookie = "";

async function count(sql: string): Promise<number> {
  return ((await env.DB.prepare(sql).first<{ n: number }>()) ?? { n: 0 }).n;
}

beforeAll(async () => {
  const short = await SELF.fetch("http://localhost/app/demo", { redirect: "manual" });
  expect(short.status).toBe(302);
  expect(short.headers.get("location")).toBe("/api/v1/auth/demo");
  const r = await SELF.fetch("http://localhost/api/v1/auth/demo", { redirect: "manual" });
  expect(r.status).toBe(302);
  expect(r.headers.get("location")).toBe(`/app/sites/${DEMO_SITE_ID}`);
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
});

test("DEMO_ENABLED is off unless set", () => {
  expect(demoEnabled({})).toBe(false);
  expect(demoEnabled({ DEMO_ENABLED: "0" })).toBe(false);
  expect(demoEnabled({ DEMO_ENABLED: "true" })).toBe(true);
  expect(demoEnabled({ DEMO_ENABLED: "1" })).toBe(true);
});

test("the demo account sees seeded sites, links, crawl results and channels", async () => {
  expect(cookie).toMatch(/^f404_session=/);
  const get = async (path: string) => {
    const res = await SELF.fetch(`http://localhost${path}`, { headers: { cookie } });
    expect(res.status, path).toBe(200);
    return (await res.json()) as any;
  };
  const me = await get("/api/v1/me");
  expect(me.user.demo).toBe(true);
  expect(me.teams).toHaveLength(1);
  const shellMe = await get("/api/v1/auth/me");
  expect(shellMe.data.demo).toBe(true);

  const { sites } = await get("/api/v1/sites");
  expect(sites.map((s: any) => s.domain).sort()).toEqual(["acme.dev", "docs.acme.dev"]);
  const docs = sites.find((s: any) => s.id === DEMO_SITE_ID);
  expect(docs.open_links).toBeGreaterThan(5);
  expect(docs.hits_7d).toBeGreaterThan(0);

  const overview = await get(`/api/v1/sites/${DEMO_SITE_ID}/overview`);
  expect(overview).toBeTruthy();
  const links = await get(`/api/v1/sites/${DEMO_SITE_ID}/links`);
  expect(links.counts.open).toBeGreaterThan(5);
  expect(links.counts.resolved).toBe(1);
  expect(links.counts.ignored).toBe(1);
  const channels = await get(`/api/v1/teams/${me.teams[0].id}/channels`);
  expect(channels.channels).toHaveLength(2);
});

test("the demo is read-only", async () => {
  const h = { "Content-Type": "application/json", cookie };
  const tries: [string, string, unknown][] = [
    ["POST", "/api/v1/sites", { name: "Mine", domain: "mine.example" }],
    ["POST", "/api/v1/teams", { name: "Mine" }],
    ["PATCH", `/api/v1/sites/${DEMO_SITE_ID}/links`, { ids: [], status: "resolved" }],
    ["DELETE", `/api/v1/sites/${DEMO_SITE_ID}`, null],
    ["POST", `/api/v1/teams/demo-team/keys`, {}],
  ];
  for (const [method, path, body] of tries) {
    const res = await SELF.fetch(`http://localhost${path}`, {
      method,
      headers: h,
      body: body === null ? undefined : JSON.stringify(body),
    });
    expect(res.status, `${method} ${path}`).toBe(403);
  }
  expect(await count("SELECT COUNT(*) n FROM websites WHERE team_id = 'demo-team'")).toBe(2);
});

test("visitor hits for a demo site are dropped", async () => {
  const before = await count(
    `SELECT COUNT(*) n FROM not_found_events WHERE website_id = '${DEMO_SITE_ID}'`,
  );
  const res = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      siteKey: "demo00000000000000000001",
      url: "https://docs.acme.dev/something-rude",
    }),
  });
  expect(await res.json()).toEqual({ ok: true, ignored: true });
  expect(
    await count(`SELECT COUNT(*) n FROM not_found_events WHERE website_id = '${DEMO_SITE_ID}'`),
  ).toBe(before);
});

test("demo sites are never crawled, even when due", async () => {
  await env.DB.prepare(
    "UPDATE websites SET last_crawl_at = NULL WHERE team_id = 'demo-team'",
  ).run();
  const result = await tick();
  expect(result.started).toBe(0);
  expect(await count("SELECT COUNT(*) n FROM crawl_tasks WHERE website_id LIKE 'demo-%'")).toBe(0);
});

test("a fresh demo is not rewritten; a stale one is, without duplicates", async () => {
  const events = () =>
    count(`SELECT COUNT(*) n FROM not_found_events WHERE website_id = '${DEMO_SITE_ID}'`);
  const seededAt = async () =>
    Number(
      (
        await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'demo_seeded_at'").first<{
          value: string;
        }>()
      )?.value,
    );
  const n = await events();
  const first = await seededAt();
  await SELF.fetch("http://localhost/api/v1/auth/demo", { redirect: "manual" });
  expect(await seededAt()).toBe(first);

  await env.DB.prepare("UPDATE app_meta SET value = ? WHERE key = 'demo_seeded_at'")
    .bind(String(Date.now() - DEMO_RESEED_MS - 1000))
    .run();
  // two visitors at once: one rewrites, neither fails
  const [a, b] = await Promise.all([
    SELF.fetch("http://localhost/api/v1/auth/demo", { redirect: "manual" }),
    SELF.fetch("http://localhost/api/v1/auth/demo", { redirect: "manual" }),
  ]);
  expect([a.status, b.status]).toEqual([302, 302]);
  expect(await seededAt()).toBeGreaterThan(first);
  expect(await events()).toBe(n);
  // the crawler's last run is back in the past few hours
  const site = await env.DB.prepare("SELECT last_crawl_at FROM websites WHERE id = ?")
    .bind(DEMO_SITE_ID)
    .first<{ last_crawl_at: number }>();
  expect(site!.last_crawl_at).toBeGreaterThan(Date.now() - 3 * 3_600_000);
});
