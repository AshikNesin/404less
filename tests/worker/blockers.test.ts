// Rate limiting, retention pruning, robots.txt, queue config.
import {
  SELF,
  env,
  createScheduledController,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../../apps/web/src/server/entry.worker";
import { scheduled as scheduledHandler } from "../../apps/web/src/server/worker/cron";
import { parseRobots } from "../../apps/web/src/server/api/crawl/robots";
import { beforeAll, expect, test } from "vitest";

let cookie = "";
let teamId = "";
let siteId = "";
let siteKey = "";

beforeAll(async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "blk@example.com" }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "Blk" }),
    })
  ).json()) as any;
  teamId = team.team.id;
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId, name: "S", domain: "blk.test" }),
    })
  ).json()) as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
});

test("robots: disallow rules respected, empty disallow allows, explicit agent beats star", () => {
  const r1 = parseRobots("https://x.test", `User-agent: *\nDisallow: /private/\nDisallow: /tmp`);
  expect(r1.allowed("/private/x")).toBe(false);
  expect(r1.allowed("https://x.test/private/x")).toBe(false);
  expect(r1.allowed("/public")).toBe(true);
  expect(r1.allowed("/tmpfile")).toBe(false); // Disallow /tmp is a prefix match
  const r2 = parseRobots(
    "https://x.test",
    `User-agent: 404less-bot\nDisallow:\n\nUser-agent: *\nDisallow: /`,
  );
  expect(r2.allowed("/anything")).toBe(true); // our agent explicitly allowed everything
  const r3 = parseRobots("https://x.test", `User-agent: *\nDisallow: /`);
  expect(r3.allowed("/anything")).toBe(false);
});

test("rate limiter: DO counts per site, returns 429 over budget", async () => {
  const stub = (env as any).RATELIMIT.get((env as any).RATELIMIT.idFromName("test-site"));
  // send 500 events -> 429 on the 501st
  let statuses: number[] = [];
  for (let i = 0; i < 501; i++) {
    statuses.push((await stub.fetch("https://rl/test-site/check", { method: "POST" })).status);
  }
  expect(statuses[499]).toBe(204); // 500th allowed
  expect(statuses[500]).toBe(429); // 501st blocked
  expect((await stub.fetch("https://rl/test-site/check", { method: "POST" })).status).toBe(429);
});

test("ingest: rate-limited site still returns ok but stops writing", async () => {
  // exhaust the limiter for this site via direct DO hits, then track — no 404 row should appear
  const stub = (env as any).RATELIMIT.get((env as any).RATELIMIT.idFromName(siteId));
  for (let i = 0; i < 500; i++) await stub.fetch(`https://rl/${siteId}/check`, { method: "POST" });
  const limited = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteKey, url: "https://blk.test/limited-1" }),
  });
  expect(limited.status).toBe(200);
  expect(await limited.json()).toEqual({ ok: true, limited: true });
  const ev = (await (
    await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/events`, { headers: { cookie } })
  ).json()) as any;
  expect(ev.events.map((e: any) => e.url)).not.toContain("https://blk.test/limited-1");
});

test("retention: nightly cron prunes old events", async () => {
  // seed an old event directly
  await env.DB.prepare(
    "INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, NULL, NULL, ?)",
  )
    .bind(crypto.randomUUID(), siteId, "https://blk.test/ancient", Date.now() - 91 * 86_400_000)
    .run();
  await env.DB.prepare(
    "INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, NULL, NULL, ?)",
  )
    .bind(crypto.randomUUID(), siteId, "https://blk.test/fresh", Date.now())
    .run();

  const ctrl = createScheduledController({ scheduledTime: new Date(0), cron: "17 3 * * *" });
  const ctx = createExecutionContext();
  await scheduledHandler(ctrl, env as never, ctx);
  await waitOnExecutionContext(ctx);

  const ev = (await (
    await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/events`, { headers: { cookie } })
  ).json()) as any;
  const urls = ev.events.map((e: any) => e.url);
  expect(urls).toContain("https://blk.test/fresh");
  expect(urls).not.toContain("https://blk.test/ancient");
});
