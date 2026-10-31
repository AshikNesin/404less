// The 404less app on Node (pnpm dev): groot's test setup boots it on in-memory
// SQLite with drizzle's migrator; requests carry the Node binding stand-ins.
// The full behaviour suite runs in workerd (tests/worker); this proves the Node
// runtime path works end to end.
import { describe, expect, it } from "vite-plus/test";
import { createWebApp } from "../../../apps/web/src/server/app";
import { sql } from "drizzle-orm";
import { db } from "../../../apps/web/src/server/db";
import { createNodeBindings } from "../../../apps/web/src/server/node-bindings";

const app = createWebApp();
const bindings = createNodeBindings({ MAX_SITES_PER_TEAM: "5" });
const call = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init), bindings);
const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function signIn(email: string) {
  const r = await call("/api/v1/auth/magic", { method: "POST", ...json({ email }) });
  const { devLink } = (await r.json()) as { devLink: string };
  const v = await call(new URL(devLink).pathname + new URL(devLink).search, { redirect: "manual" });
  return (v.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("404less on Node", () => {
  it("applies every migration through drizzle's migrator", async () => {
    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const names = tables.map((t) => t.name);
    for (const t of ["users", "websites", "broken_links", "known_urls", "app_meta", "kv"]) {
      expect(names).toContain(t);
    }
  });

  it("signs in, adds a site, records a widget hit and lists it", async () => {
    const cookie = await signIn("node@example.com");
    expect(cookie).toMatch(/^f404_session=/);

    const me = await call("/api/v1/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const { teams } = (await me.json()) as { teams: { id: string }[] };
    expect(teams).toHaveLength(1);

    const created = await call("/api/v1/sites", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Node", domain: "node.example" }),
    });
    expect(created.status).toBe(201);
    const { site } = (await created.json()) as { site: { id: string; site_key: string } };

    const track = await call("/api/track", {
      method: "POST",
      ...json({ siteKey: site.site_key, url: "https://node.example/missing", title: "Missing" }),
    });
    expect(await track.json()).toEqual({ ok: true });

    const links = await call(`/api/v1/sites/${site.id}/links`, { headers: { cookie } });
    const body = (await links.json()) as { links: { url: string; hits: number }[] };
    expect(body.links.map((l) => [l.url, l.hits])).toEqual([["https://node.example/missing", 1]]);
  });

  it("rejects the dashboard without a session", async () => {
    expect((await call("/api/v1/sites")).status).toBe(401);
  });

  it("serves the embed script", async () => {
    const r = await call("/embed.js");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("404less");
  });
});
