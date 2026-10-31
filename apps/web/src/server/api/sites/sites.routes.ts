// Authenticated dashboard API: me, teams, sites. Mounted under the session-guarded /api/v1 (see app.ts).
import { Hono } from "hono";
import { newId, newSiteKey, now } from "../../lib/auth";
import {
  crawlReport,
  deleteSite,
  listEvents,
  listSitesForUser,
  siteForUser,
  siteOverview,
} from "./sites.service";
import type { AppBindings, Env } from "../../types";
import { and, asc, count, desc, eq, max, min, sql } from "drizzle-orm";
import { batch, db, notFoundEvents, teamMembers, teams, users, websites } from "../../db";

export const sites = new Hono<AppBindings>();

async function teamsForUser(env: Env, userId: string) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      owner_user_id: teams.owner_user_id,
      created_at: teams.created_at,
      role: teamMembers.role,
    })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.team_id, teams.id))
    .where(eq(teamMembers.user_id, userId))
    .orderBy(asc(teams.created_at));
}

// --- me ---

sites.get("/me", async (c) => {
  const userId = c.get("userId");
  const user = await db
    .select({ id: users.id, email: users.email, created_at: users.created_at })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user, teams: await teamsForUser(c.env, userId) });
});

// --- teams ---

sites.get("/teams", async (c) => c.json({ teams: await teamsForUser(c.env, c.get("userId")) }));

sites.post("/teams", async (c) => {
  const { name } = await c.req.json().catch(() => ({ name: null }));
  if (!name || typeof name !== "string" || name.length > 100)
    return c.json({ error: "invalid name" }, 400);
  const userId = c.get("userId");
  const teamId = newId();
  const ts = now();
  await batch([
    db.insert(teams).values({ id: teamId, name, owner_user_id: userId, created_at: ts }),
    db.insert(teamMembers).values({ team_id: teamId, user_id: userId, role: "owner" }),
  ]);
  return c.json(
    { team: { id: teamId, name, owner_user_id: userId, created_at: ts, role: "owner" } },
    201,
  );
});

// --- sites ---

sites.get("/sites", async (c) => c.json({ sites: await listSitesForUser(c.env, c.get("userId")) }));

sites.post("/sites", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const domain = typeof body?.domain === "string" ? body.domain.trim() : "";
  if (!name || !domain) return c.json({ error: "name and domain required" }, 400);
  const userId = c.get("userId");

  // team: explicit, else the user's first team (created at first sign-in)
  const teams = await teamsForUser(c.env, userId);
  const team = body?.teamId ? teams.find((t) => t.id === body.teamId) : teams[0];
  if (!team) return c.json({ error: "not a team member" }, 403);
  if (team.role === "viewer") return c.json({ error: "viewers cannot create sites" }, 403);

  // site quota (protects self-hoster free-tier limits; default 5)
  const maxSites = Number(c.env.MAX_SITES_PER_TEAM ?? 5);
  const [{ n }] = await db
    .select({ n: count() })
    .from(websites)
    .where(eq(websites.team_id, team.id));
  if (n >= maxSites) return c.json({ error: `site limit reached (max ${maxSites})` }, 402);

  let host: string;
  try {
    const u = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
    host = u.hostname.replace(/^www\./, "") + (u.port ? `:${u.port}` : "");
    if (!host || !/^[a-z0-9.:-]+$/i.test(host)) throw new Error("bad host");
  } catch {
    return c.json({ error: "enter a domain like example.com" }, 400);
  }
  const dup = await db
    .select({ id: websites.id })
    .from(websites)
    .where(and(eq(websites.team_id, team.id), eq(websites.domain, host)))
    .get();
  if (dup) return c.json({ error: `${host} is already monitored by this team` }, 409);

  const siteId = newId();
  const siteKey = newSiteKey();
  await db.insert(websites).values({
    id: siteId,
    team_id: team.id,
    name,
    domain: host,
    site_key: siteKey,
    created_at: now(),
  });
  return c.json(
    { site: { id: siteId, team_id: team.id, name, domain: host, site_key: siteKey } },
    201,
  );
});

sites.patch("/sites/:id", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === "viewer") return c.json({ error: "viewers cannot change settings" }, 403);
  const site = found.site;
  const body = await c.req.json().catch(() => ({}));

  const codes = (v: unknown, fallback: string): string =>
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 100 && x <= 599)
      ? JSON.stringify([...new Set(v)].slice(0, 50))
      : fallback;
  const patterns = (v: unknown, fallback: string): string =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim() && x.length <= 200)
      ? JSON.stringify([...new Set(v.map((x: string) => x.trim()))].slice(0, 100))
      : fallback;
  const ignore =
    body.ignore_status_codes !== undefined
      ? codes(body.ignore_status_codes, site.ignore_status_codes)
      : site.ignore_status_codes;
  const excl =
    body.exclude_patterns !== undefined
      ? patterns(body.exclude_patterns, site.exclude_patterns)
      : site.exclude_patterns;
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : site.name;
  const notify =
    typeof body?.notify_enabled === "boolean" ? (body.notify_enabled ? 1 : 0) : undefined;
  const digest =
    Number.isInteger(body?.digest_minutes) &&
    body.digest_minutes >= 5 &&
    body.digest_minutes <= 1440
      ? body.digest_minutes
      : undefined;
  if (body?.digest_minutes !== undefined && digest === undefined)
    return c.json({ error: "digest_minutes must be 5..1440" }, 400);
  const crawlEnabled =
    typeof body?.crawl_enabled === "boolean" ? (body.crawl_enabled ? 1 : 0) : undefined;
  const crawlMax =
    Number.isInteger(body?.crawl_max_pages) &&
    body.crawl_max_pages >= 1 &&
    body.crawl_max_pages <= 500
      ? body.crawl_max_pages
      : undefined;
  if (body?.crawl_max_pages !== undefined && crawlMax === undefined)
    return c.json({ error: "crawl_max_pages must be 1..500" }, 400);

  // optional fields keep their stored value when not sent
  await db
    .update(websites)
    .set({
      name,
      ignore_status_codes: ignore,
      exclude_patterns: excl,
      ...(notify !== undefined && { notify_enabled: notify }),
      ...(digest !== undefined && { digest_minutes: digest }),
      ...(crawlEnabled !== undefined && { crawl_enabled: crawlEnabled }),
      ...(crawlMax !== undefined && { crawl_max_pages: crawlMax }),
    })
    .where(eq(websites.id, site.id));
  return c.json({
    ok: true,
    site: {
      id: site.id,
      name,
      ignore_status_codes: JSON.parse(ignore),
      exclude_patterns: JSON.parse(excl),
    },
  });
});

sites.delete("/sites/:id", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === "viewer") return c.json({ error: "viewers cannot delete sites" }, 403);
  await deleteSite(c.env, found.site.id);
  return c.json({ ok: true });
});

// everything the overview page shows
sites.get("/sites/:id/overview", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  return c.json(await siteOverview(c.env, found.site));
});

// start a crawl now (manual trigger; same path the cron takes)
sites.post("/sites/:id/crawl", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  if (found.role === "viewer") return c.json({ error: "forbidden" }, 403);
  // stamp the run now: until the queue picks it up the dashboard would show the previous run as current
  const stamp = (ts: number | null) =>
    db.update(websites).set({ last_crawl_at: ts }).where(eq(websites.id, found.site.id));
  await stamp(now());
  try {
    await c.env.CRAWLQ.send({ kind: "crawl-site", siteId: found.site.id, manual: true });
  } catch (err) {
    await stamp(found.site.last_crawl_at); // nothing was queued: the previous run is still the current one
    throw err;
  }
  return c.json({ ok: true, started: true });
});

// latest check per URL from the current run (broken first)
sites.get("/sites/:id/crawl-report", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);
  const rows = await crawlReport(c.env, found.site, limit);
  return c.json({ results: rows, broken: rows.filter((r) => (r as { ok: number }).ok === 0) });
});

sites.get("/sites/:id/events", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  return c.json({ events: await listEvents(c.env, found.site.id, limit) });
});

// CSV export of raw events, or aggregated by url
sites.get("/sites/:id/events.csv", async (c) => {
  const found = await siteForUser(c.env, c.req.param("id"), c.get("userId"));
  if ("error" in found) return c.json({ error: found.error }, found.status as 403 | 404);
  const site = found.site;
  const group = c.req.query("group") === "url";
  const limit = Math.min(Number(c.req.query("limit") ?? 5000), 5000);
  type Row = {
    url: string;
    hits?: number;
    first_seen?: number | null;
    last_seen?: number | null;
    referrer?: string | null;
    user_agent?: string | null;
    ts?: number;
  };
  const ofSite = eq(notFoundEvents.website_id, site.id);
  const rows: Row[] = group
    ? await db
        .select({
          url: notFoundEvents.url,
          hits: count(),
          first_seen: min(notFoundEvents.ts),
          last_seen: max(notFoundEvents.ts),
        })
        .from(notFoundEvents)
        .where(ofSite)
        .groupBy(notFoundEvents.url)
        .orderBy(desc(count()))
        .limit(limit)
    : await db
        .select({
          url: notFoundEvents.url,
          referrer: notFoundEvents.referrer,
          user_agent: notFoundEvents.user_agent,
          ts: notFoundEvents.ts,
        })
        .from(notFoundEvents)
        .where(ofSite)
        .orderBy(desc(notFoundEvents.ts))
        .limit(limit);

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = group ? "url,hits,first_seen,last_seen" : "url,referrer,user_agent,ts";
  const body = rows
    .map((r) =>
      group
        ? [
            r.url,
            r.hits ?? 0,
            new Date(r.first_seen ?? 0).toISOString(),
            new Date(r.last_seen ?? 0).toISOString(),
          ]
            .map(esc)
            .join(",")
        : [r.url, r.referrer ?? "", r.user_agent ?? "", new Date(r.ts ?? 0).toISOString()]
            .map(esc)
            .join(","),
    )
    .join("\n");
  return c.body(`${header}\n${body}\n`, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="404less-${site.domain}${group ? "-grouped" : ""}.csv"`,
  });
});
