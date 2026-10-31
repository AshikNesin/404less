// broken_links status bookkeeping: resolved_at stamping and bulk triage size.
import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import {
  recordCrawlResult,
  recordVisitorHit,
  setLinkStatus,
} from "../../apps/web/src/server/api/links/links.service";

const SITE = "site-status";
const noEnv = {} as never;
const row = (url: string) =>
  env.DB.prepare("SELECT status, resolved_at FROM broken_links WHERE website_id = ? AND url = ?")
    .bind(SITE, url)
    .first<{ status: string; resolved_at: number | null }>();

beforeAll(async () => {
  await SELF.fetch("http://localhost/health"); // boot: migrations + groot's db
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, created_at) VALUES ('us', 'status@example.com', 1)",
    ),
    env.DB.prepare(
      "INSERT INTO teams (id, name, owner_user_id, created_at) VALUES ('ts', 'T', 'us', 1)",
    ),
    env.DB.prepare(
      "INSERT INTO websites (id, team_id, name, domain, site_key, created_at) VALUES (?, 'ts', 'S', 'status.test', 'kstatus', 1)",
    ).bind(SITE),
  ]);
});

test("crawler success resolves an open link and stamps resolved_at", async () => {
  const url = "https://status.test/a";
  await recordVisitorHit(noEnv, SITE, url, 1000);
  expect(await row(url)).toEqual({ status: "open", resolved_at: null });

  await recordCrawlResult(noEnv, SITE, url, { status: 200, ok: true }, 5000);
  expect(await row(url)).toEqual({ status: "resolved", resolved_at: 5000 });

  // a later successful check confirms it; it was resolved at 5000, not now
  await recordCrawlResult(noEnv, SITE, url, { status: 200, ok: true }, 9000);
  expect(await row(url)).toEqual({ status: "resolved", resolved_at: 5000 });

  // breaking again reopens and clears it
  await recordCrawlResult(noEnv, SITE, url, { status: 404, ok: false }, 12000);
  expect(await row(url)).toEqual({ status: "open", resolved_at: null });
});

test("crawler success never stamps an ignored link", async () => {
  const url = "https://status.test/ignored";
  await recordVisitorHit(noEnv, SITE, url, 1000);
  const { id } = (await env.DB.prepare("SELECT id FROM broken_links WHERE url = ?")
    .bind(url)
    .first<{ id: string }>())!;
  await setLinkStatus(noEnv, SITE, [id], "ignored");
  await recordCrawlResult(noEnv, SITE, url, { status: 200, ok: true }, 5000);
  expect(await row(url)).toEqual({ status: "ignored", resolved_at: null });
});

test("bulk triage accepts the full 100 ids the API allows (D1 caps a statement at 100 parameters)", async () => {
  const ids: string[] = [];
  const stmts = [];
  for (let i = 0; i < 100; i++) {
    const id = `bulk-${i}`;
    ids.push(id);
    stmts.push(
      env.DB.prepare(
        "INSERT INTO broken_links (id, website_id, url, first_seen, last_seen) VALUES (?, ?, ?, 1, 1)",
      ).bind(id, SITE, `https://status.test/bulk/${i}`),
    );
  }
  await env.DB.batch(stmts);

  expect(await setLinkStatus(noEnv, SITE, ids, "resolved")).toBe(100);
  const counts = await env.DB.prepare(
    "SELECT COUNT(*) AS n, MIN(resolved_at) AS min_at FROM broken_links WHERE website_id = ? AND id LIKE 'bulk-%' AND status = 'resolved'",
  )
    .bind(SITE)
    .first<{ n: number; min_at: number | null }>();
  expect(counts!.n).toBe(100);
  expect(counts!.min_at).not.toBeNull();
});
