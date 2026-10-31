// Regression tests for PR #7 review findings: sign-in hardening, viewer roles,
// CSV formula injection, digest batching, widget home link.
import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { buildDigest, DIGEST_MAX_ITEMS } from "../../apps/web/src/server/lib/notify";

const json = { "Content-Type": "application/json" };

async function signIn(email: string): Promise<string> {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email }),
  });
  const { devLink } = (await r.json()) as { devLink: string };
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  return (v.headers.get("set-cookie") ?? "").split(";")[0];
}

let owner = "";
let viewer = "";
let teamId = "";
let siteId = "";
let siteKey = "";

beforeAll(async () => {
  owner = await signIn("rf-owner@example.com");
  viewer = await signIn("rf-viewer@example.com");
  const me = (await (
    await SELF.fetch("http://localhost/api/v1/me", { headers: { cookie: owner } })
  ).json()) as any;
  teamId = me.teams[0].id;
  const viewerMe = (await (
    await SELF.fetch("http://localhost/api/v1/me", { headers: { cookie: viewer } })
  ).json()) as any;
  await env.DB.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'viewer')")
    .bind(teamId, viewerMe.user.id)
    .run();
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: { ...json, cookie: owner },
      body: JSON.stringify({ teamId, name: "RF", domain: "localhost:8090" }),
    })
  ).json()) as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
});

test("no email configured on a public host: sign-in fails closed, no link, no token", async () => {
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM magic_tokens").first<{
    n: number;
  }>();
  const r = await SELF.fetch("https://404less.example/api/v1/auth/magic", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "victim@example.com" }),
  });
  expect(r.status).toBe(503);
  const body = (await r.json()) as Record<string, unknown>;
  expect(body.devLink).toBeUndefined();
  expect(body.error).toMatch(/RESEND_API_KEY/);
  const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM magic_tokens").first<{
    n: number;
  }>();
  expect(after!.n).toBe(before!.n);
  expect(
    await env.DB.prepare("SELECT 1 FROM users WHERE email = 'victim@example.com'").first(),
  ).toBeNull();
});

test("a sign-in link works exactly once", async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "rf-once@example.com" }),
  });
  const { devLink } = (await r.json()) as { devLink: string };
  const [a, b] = await Promise.all([
    SELF.fetch(devLink, { redirect: "manual" }),
    SELF.fetch(devLink, { redirect: "manual" }),
  ]);
  const signedIn = [a, b].filter((res) => res.headers.get("location") === "/app");
  expect(signedIn).toHaveLength(1);
});

test("viewers cannot manage API keys", async () => {
  const create = await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, {
    method: "POST",
    headers: { cookie: viewer },
  });
  expect(create.status).toBe(403);
  const ok = await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, {
    method: "POST",
    headers: { cookie: owner },
  });
  expect(ok.status).toBe(201);
  const { key } = (await ok.json()) as any;
  const del = await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys/${key.id}`, {
    method: "DELETE",
    headers: { cookie: viewer },
  });
  expect(del.status).toBe(403);
  const list = await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, {
    headers: { cookie: viewer },
  });
  expect(list.status).toBe(200); // reading stays allowed
});

test("viewers cannot triage or recheck links; CSV neutralises formulas", async () => {
  await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      siteKey,
      url: "http://localhost:8090/formula",
      title: '=HYPERLINK("https://evil.example","x")',
    }),
  });
  const { links } = (await (
    await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
      headers: { cookie: owner },
    })
  ).json()) as any;
  const id = links[0].id;

  const patch = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links`, {
    method: "PATCH",
    headers: { ...json, cookie: viewer },
    body: JSON.stringify({ ids: [id], status: "resolved" }),
  });
  expect(patch.status).toBe(403);
  const recheck = await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links/${id}/check`, {
    method: "POST",
    headers: { cookie: viewer },
  });
  expect(recheck.status).toBe(403);

  const csv = await (
    await SELF.fetch(`http://localhost/api/v1/sites/${siteId}/links.csv?status=all`, {
      headers: { cookie: owner },
    })
  ).text();
  expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"",""x"")"`);
  expect(csv).not.toMatch(/,=HYPERLINK/);
});

test("widget home link uses the crawler's scheme choice (http for local hosts)", async () => {
  const r = await SELF.fetch(
    `http://localhost/api/suggestions?site=${siteKey}&url=${encodeURIComponent("http://localhost:8090/x")}`,
  );
  expect(((await r.json()) as any).home).toBe("http://localhost:8090/");
});

test("digest: title counts every hit; only the top URLs are listed", () => {
  const groups = Array.from({ length: DIGEST_MAX_ITEMS + 5 }, (_, i) => ({
    url: `https://x.example/${i}`,
    count: 2,
    lastTs: 0,
    topReferrer: null,
  }));
  const d = buildDigest("X", groups, 15);
  expect(d.title).toContain(`${groups.length * 2} broken-link hits`);
  expect(d.text.split("\n")).toHaveLength(DIGEST_MAX_ITEMS);
});

// Cloudflare caps storage.delete() at 128 keys (local Miniflare doesn't enforce it):
// this checks a >128-event window flushes and drains through the chunked delete.
test("digest DO flushes and drains a window of more than 128 events", async () => {
  const stub = (env as any).DIGEST.get((env as any).DIGEST.idFromName(siteId));
  for (let i = 0; i < 140; i++) {
    const r = await stub.fetch("https://digest/event", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        url: `http://localhost:8090/p${i % 7}`,
        ts: Date.now(),
        referrer: null,
      }),
    });
    expect(r.status).toBe(200);
  }
  expect((await stub.fetch("https://digest/flush", { method: "POST" })).status).toBe(200);
  // the buffer is empty again: a second flush has nothing to send and still succeeds
  expect((await stub.fetch("https://digest/flush", { method: "POST" })).status).toBe(200);
});
