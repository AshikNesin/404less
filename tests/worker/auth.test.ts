// Integration tests running INSIDE workerd against the real Worker + real D1
// (Miniflare's local SQLite: no Cloudflare account, no deploy, no edge network).
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, test } from "vitest";

let cookie = "";

beforeAll(async () => {
  // schema applied via setup file (runs in Node; see vitest.config.ts setupFiles)

  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "tester@example.com" }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`magic failed ${r.status}: ${text}`);
  const { devLink } = JSON.parse(text) as { devLink: string };
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
});

test("magic-link flow issues session cookie; token is single-use", async () => {
  expect(cookie).toMatch(/^f404_session=/);

  const r1 = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "single@example.com" }),
  });
  const { devLink } = await r1.json();
  const first = await SELF.fetch(devLink, { redirect: "manual" });
  expect(first.status).toBe(302);
  const replay = await SELF.fetch(devLink, { redirect: "manual" });
  expect(replay.status).toBe(302); // used/expired tokens bounce to the login page with an error
  expect(replay.headers.get("location")).toContain("error=expired");
});

test("first sign-in creates a personal team; sites can be added without naming one", async () => {
  const h = { "Content-Type": "application/json", cookie };
  const me = (await (
    await SELF.fetch("http://localhost/api/v1/me", { headers: { cookie } })
  ).json()) as any;
  expect(me.user.email).toBe("tester@example.com");
  expect(me.teams.length).toBeGreaterThanOrEqual(1);
  expect(me.teams[0].role).toBe("owner");
  const r = await SELF.fetch("http://localhost/api/v1/sites", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "Implicit", domain: "https://www.implicit.example/" }),
  });
  expect(r.status).toBe(201);
  const { site } = (await r.json()) as any;
  expect(site.domain).toBe("implicit.example");
  const dup = await SELF.fetch("http://localhost/api/v1/sites", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "Again", domain: "implicit.example" }),
  });
  expect(dup.status).toBe(409);
});

test("dashboard API requires auth", async () => {
  const r = await SELF.fetch("http://localhost/api/v1/teams");
  expect(r.status).toBe(401);
});

test("full flow: team -> site -> track -> events", async () => {
  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "T" }),
    })
  ).json()) as any;
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId: team.team.id, name: "S", domain: "example.com" }),
    })
  ).json()) as any;
  expect(site.site.site_key).toMatch(/^[0-9a-f]{24}$/);

  const track = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteKey: site.site.site_key,
      url: "https://example.com/gone",
      referrer: "https://example.com/",
    }),
  });
  expect(await track.json()).toEqual({ ok: true });

  const ev = (await (
    await SELF.fetch(`http://localhost/api/v1/sites/${site.site.id}/events`, {
      headers: { cookie },
    })
  ).json()) as any;
  expect(ev.events).toHaveLength(1);
  expect(ev.events[0].url).toBe("https://example.com/gone");
});

test("site quota (MAX_SITES_PER_TEAM=2 in test env)", async () => {
  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "Quota" }),
    })
  ).json()) as any;
  for (const d of ["a.example", "b.example"]) {
    const r = await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId: team.team.id, name: d, domain: d }),
    });
    expect(r.status).toBe(201);
  }
  const over = await SELF.fetch("http://localhost/api/v1/sites", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ teamId: team.team.id, name: "c", domain: "c.example" }),
  });
  expect(over.status).toBe(402);
});

test("ingest rejects unknown site and bad urls", async () => {
  const r1 = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteKey: "nope", url: "https://x.dev/" }),
  });
  expect(r1.status).toBe(404);

  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "T2" }),
    })
  ).json()) as any;
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId: team.team.id, name: "S2", domain: "q.example" }),
    })
  ).json()) as any;
  const r2 = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteKey: site.site.site_key, url: "javascript:alert(1)" }),
  });
  expect(r2.status).toBe(400);
});

test("embed.js served with cache headers", async () => {
  const r = await SELF.fetch("http://localhost/embed.js");
  expect(r.headers.get("content-type")).toContain("javascript");
  expect(r.headers.get("cache-control")).toContain("max-age=86400");
  expect(await r.text()).toContain("data-site");
});
