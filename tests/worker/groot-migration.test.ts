// Guards for the move onto groot: database continuity for installs created by
// wrangler's migrator, the frozen public widget contract, and zero-config boot.
import { SELF, env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { migrateD1, splitStatements } from "@groot/core/database/d1";
import { migrations } from "../../apps/web/drizzle";
import embedScript from "../../apps/web/src/server/api/embed/embed-script";

type D1 = typeof env.DB;
const scratch = env as unknown as { LEGACY_DB: D1; FRESH_DB: D1; SKIPPED_DB: D1; FRESH2_DB: D1 };

const LEGACY = migrations.filter((m) => /^000[1-7]_/.test(m.name));

async function schemaOf(db: D1) {
  const { results } = await db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'
       ORDER BY type, name`,
    )
    .all<{ type: string; name: string; tbl_name: string; sql: string | null }>();
  return results;
}

describe("migration continuity (databases created before groot)", () => {
  test("an existing install applies only the new migrations, keeps its data, and matches a fresh install", async () => {
    const legacy = scratch.LEGACY_DB;
    // What production looks like today: 0001–0007 applied by `wrangler d1 migrations apply`,
    // which records each file name in d1_migrations.
    await legacy
      .prepare(
        "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      )
      .run();
    for (const m of LEGACY) {
      await legacy.batch([
        ...splitStatements(m.sql).map((s) => legacy.prepare(s)),
        legacy.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name),
      ]);
    }
    await legacy.batch([
      legacy.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)"),
      legacy.prepare("INSERT INTO app_meta (key, value) VALUES ('session_secret', 'keep-me')"),
    ]);

    const applied = await migrateD1(legacy as never, migrations);
    expect(applied).toEqual(
      migrations.map((m) => m.name).filter((n) => !LEGACY.some((l) => l.name === n)),
    );
    expect(applied[0]).toBe("0008_core_kv.sql");
    // a second boot is a no-op
    expect(await migrateD1(legacy as never, migrations)).toEqual([]);
    // data survived; the session secret (and so every signed-in session) is untouched
    expect(await legacy.prepare("SELECT email FROM users WHERE id = 'u1'").first("email")).toBe(
      "a@example.com",
    );
    expect(
      await legacy
        .prepare("SELECT value FROM app_meta WHERE key = 'session_secret'")
        .first("value"),
    ).toBe("keep-me");

    // a brand-new install (Deploy button) runs everything and lands on the same schema
    const fresh = scratch.FRESH_DB;
    expect(await migrateD1(fresh as never, migrations)).toEqual(migrations.map((m) => m.name));
    expect(await schemaOf(fresh)).toEqual(await schemaOf(legacy));
  });

  test("an install whose last wrangler deploy skipped 0007 gets it on first boot", async () => {
    // Production as of the move: Workers Builds ran `wrangler deploy` without
    // `d1 migrations apply`, so 0007 (broken_links.title …) never landed.
    const db = scratch.SKIPPED_DB;
    await db
      .prepare(
        "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      )
      .run();
    for (const m of migrations.filter((m) => /^000[1-6]_/.test(m.name))) {
      await db.batch([
        ...splitStatements(m.sql).map((s) => db.prepare(s)),
        db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name),
      ]);
    }
    await db.batch([
      db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)"),
      db.prepare(
        "INSERT INTO teams (id, name, owner_user_id, created_at) VALUES ('t1', 'T', 'u1', 1)",
      ),
      db.prepare(
        "INSERT INTO websites (id, team_id, name, domain, site_key, created_at) VALUES ('w1', 't1', 'S', 's.test', 'k1', 1)",
      ),
      db.prepare(
        "INSERT INTO known_urls (id, website_id, url, title, added_at) VALUES ('k1', 'w1', 'https://s.test/a', 'Page A', 1)",
      ),
      db.prepare(
        "INSERT INTO broken_links (id, website_id, url, first_seen, last_seen) VALUES ('b1', 'w1', 'https://s.test/a', 1, 1)",
      ),
    ]);

    expect(await migrateD1(db as never, migrations)).toEqual([
      "0007_url_titles.sql",
      "0008_core_kv.sql",
    ]);
    // 0007's backfill ran against the existing rows
    expect(await db.prepare("SELECT title FROM broken_links WHERE id = 'b1'").first("title")).toBe(
      "Page A",
    );
    const fresh = scratch.FRESH2_DB;
    await migrateD1(fresh as never, migrations);
    expect(await schemaOf(db)).toEqual(await schemaOf(fresh));
  });

  test("migration files sort in the order they were written", () => {
    const names = migrations.map((m) => m.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(names.slice(0, 7)).toEqual([
      "0001_init.sql",
      "0002_known_urls.sql",
      "0003_alerts.sql",
      "0004_crawler.sql",
      "0005_broken_links.sql",
      "0006_known_url_titles.sql",
      "0007_url_titles.sql",
    ]);
  });
});

describe("public widget contract (paths, CORS and payloads are frozen)", () => {
  const origin = "https://customer-site.example";

  test("/embed.js: same script, same caching", async () => {
    const r = await SELF.fetch("http://localhost/embed.js", { headers: { Origin: origin } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    expect(await r.text()).toBe(embedScript);
  });

  for (const [path, method] of [
    ["/api/track", "POST"],
    ["/api/suggestions", "GET"],
  ] as const) {
    test(`${method} ${path}: any origin, no credentials, even with CORS_ALLOWED_ORIGINS set`, async () => {
      const pre = await SELF.fetch(`http://localhost${path}`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": method,
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(pre.status).toBe(204);
      expect(pre.headers.get("access-control-allow-origin")).toBe("*");
      expect(pre.headers.get("access-control-allow-credentials")).toBeNull();
      expect(pre.headers.get("access-control-allow-methods")).toContain(method);
    });
  }

  test("the endpoints answer at their original paths with their original shapes", async () => {
    const track = await SELF.fetch("http://localhost/api/track", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ siteKey: "no-such-key", url: "https://x.example/a" }),
    });
    expect(track.status).toBe(404);
    expect(track.headers.get("access-control-allow-origin")).toBe("*");
    expect(await track.json()).toEqual({ error: "unknown site" });

    const sugg = await SELF.fetch(
      "http://localhost/api/suggestions?site=no-such-key&url=https://x.example/a",
      { headers: { Origin: origin } },
    );
    expect(sugg.status).toBe(404);
    expect(sugg.headers.get("access-control-allow-origin")).toBe("*");
    expect(await sugg.json()).toEqual({ error: "unknown site" });
  });

  test("the dashboard API keeps the allow-list (no wildcard)", async () => {
    const pre = await SELF.fetch("http://localhost/api/v1/me", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    });
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("/mcp stays at the root path", async () => {
    const r = await SELF.fetch("http://localhost/mcp", { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
    expect(((await r.json()) as { jsonrpc: string }).jsonrpc).toBe("2.0");
  });
});

describe("sign-in and zero-config boot", () => {
  test("sign-in links emailed before the move still work", async () => {
    const r = await SELF.fetch("http://localhost/auth/verify?token=abc", { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/api/v1/auth/verify?token=abc");
  });

  test("magic links point at /api/v1 and sign in end to end", async () => {
    const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "zero@example.com" }),
    });
    const { devLink } = (await r.json()) as { devLink: string };
    expect(devLink).toMatch(/^http:\/\/localhost\/api\/v1\/auth\/verify\?token=/);
    const v = await SELF.fetch(devLink, { redirect: "manual" });
    expect(v.headers.get("location")).toBe("/app");
    const cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie).toMatch(/^f404_session=/);
    const me = await SELF.fetch("http://localhost/api/v1/me", { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  test("no secrets configured: groot boots in production with generated, persisted secrets", async () => {
    await SELF.fetch("http://localhost/health");
    const rows = await env.DB.prepare(
      "SELECT key FROM app_meta WHERE key LIKE 'groot_%' ORDER BY key",
    ).all<{ key: string }>();
    expect(rows.results.map((r) => r.key)).toEqual([
      "groot_admin_auth_key",
      "groot_jwt_secret_key",
    ]);
    expect((await SELF.fetch("http://localhost/health")).status).toBe(200);
  });
});

describe("@groot/shell session contract", () => {
  test("GET /api/v1/auth/me: envelope with the user, 401 without a session", async () => {
    const anon = await SELF.fetch("http://localhost/api/v1/auth/me");
    expect(anon.status).toBe(401);
    expect(((await anon.json()) as { success: boolean }).success).toBe(false);

    const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "shell@example.com" }),
    });
    const { devLink } = (await r.json()) as { devLink: string };
    const v = await SELF.fetch(devLink, { redirect: "manual" });
    const cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
    const me = await SELF.fetch("http://localhost/api/v1/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      success: true,
      data: { email: "shell@example.com", name: null },
    });
  });
});
