// The public live demo: one read-only account anyone can open from /app/demo,
// holding a sample team with two sites. Off unless DEMO_ENABLED is set.
//
// The data is fiction written straight to the tables (no crawls, no visitor
// traffic): timestamps are relative to the moment it is written, and the first
// visit after DEMO_RESEED_MS rewrites it so "last seen 2h ago" stays true.
// Demo rows carry fixed `demo-` ids: the session middleware refuses writes from
// the demo user, ingest drops tracks for demo sites, and the crawl tick skips them.
import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Env } from "../../types";
import {
  alertChannels,
  alerts,
  appMeta,
  batchAll,
  brokenLinks,
  changes,
  crawlSources,
  crawlTasks,
  db,
  knownUrls,
  linkChecks,
  notFoundEvents,
  teamMembers,
  teams,
  users,
  websites,
} from "../../db";

export const DEMO_USER_ID = "demo-user";
export const DEMO_EMAIL = "demo@404less.com";
const DEMO_TEAM_ID = "demo-team";
export const DEMO_SITE_ID = "demo-site-docs";
const DEMO_MARKETING_ID = "demo-site-marketing";
const DEMO_SITES = [DEMO_SITE_ID, DEMO_MARKETING_ID];
const SEEDED_AT_KEY = "demo_seeded_at";
/** How long seeded data stays before the next visit rewrites it. */
export const DEMO_RESEED_MS = 24 * 3_600_000;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function demoEnabled(env: Pick<Env, "DEMO_ENABLED">): boolean {
  return ["1", "true", "yes", "on"].includes((env.DEMO_ENABLED ?? "").trim().toLowerCase());
}

export function isDemoUser(userId: string | undefined): boolean {
  return userId === DEMO_USER_ID;
}

/** Demo sites are never crawled and never take visitor hits. */
export function isDemoSite(siteId: string): boolean {
  return siteId.startsWith("demo-");
}

/**
 * Make sure the demo account exists and its data is fresh. Cheap when it is:
 * one read. When stale, one caller claims the rewrite (a conditional update of
 * app_meta) so concurrent visitors never seed twice.
 */
export async function ensureDemoData(at: number = Date.now()): Promise<void> {
  const row = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, SEEDED_AT_KEY))
    .get();
  if (row && at - Number(row.value) < DEMO_RESEED_MS) return;

  // claim: insert the marker, or move it forward only if it is still stale
  const claimed = row
    ? changes(
        await db
          .update(appMeta)
          .set({ value: String(at) })
          .where(and(eq(appMeta.key, SEEDED_AT_KEY), eq(appMeta.value, row.value))),
      )
    : changes(
        await db
          .insert(appMeta)
          .values({ key: SEEDED_AT_KEY, value: String(at) })
          .onConflictDoNothing(),
      );
  if (!claimed) return; // another request is seeding right now

  try {
    await seedDemo(at);
  } catch (error) {
    // let the next visit try again instead of leaving half a demo for a day
    await db.update(appMeta).set({ value: "0" }).where(eq(appMeta.key, SEEDED_AT_KEY));
    throw error;
  }
}

/** Wipe the demo team's data and write it again, relative to `at`. */
export async function seedDemo(at: number): Promise<void> {
  const rand = mulberry32(404);
  const stmts: BatchItem<"sqlite">[] = [];

  // --- account (kept across reseeds, so a demo session stays valid) ---
  stmts.push(
    db
      .insert(users)
      .values({ id: DEMO_USER_ID, email: DEMO_EMAIL, created_at: at - 120 * DAY })
      .onConflictDoNothing(),
    db
      .insert(teams)
      .values({
        id: DEMO_TEAM_ID,
        name: "Acme",
        owner_user_id: DEMO_USER_ID,
        created_at: at - 120 * DAY,
      })
      .onConflictDoNothing(),
    db
      .insert(teamMembers)
      .values({ team_id: DEMO_TEAM_ID, user_id: DEMO_USER_ID, role: "owner" })
      .onConflictDoNothing(),
  );

  // --- wipe (children before parents) ---
  const ofDemo = <T extends { website_id: unknown }>(t: T) =>
    inArray(t.website_id as typeof notFoundEvents.website_id, DEMO_SITES);
  stmts.push(
    db.delete(notFoundEvents).where(ofDemo(notFoundEvents)),
    db.delete(knownUrls).where(ofDemo(knownUrls)),
    db.delete(linkChecks).where(ofDemo(linkChecks)),
    db.delete(crawlSources).where(ofDemo(crawlSources)),
    db.delete(crawlTasks).where(ofDemo(crawlTasks)),
    db.delete(brokenLinks).where(ofDemo(brokenLinks)),
    db
      .delete(alerts)
      .where(
        or(
          ofDemo(alerts),
          inArray(
            alerts.channel_id,
            db
              .select({ id: alertChannels.id })
              .from(alertChannels)
              .where(eq(alertChannels.team_id, DEMO_TEAM_ID)),
          ),
        ),
      ),
    db.delete(alertChannels).where(eq(alertChannels.team_id, DEMO_TEAM_ID)),
    db.delete(websites).where(inArray(websites.id, DEMO_SITES)),
  );

  // --- sites ---
  const lastCrawl = at - 2 * HOUR;
  stmts.push(
    db.insert(websites).values({
      id: DEMO_SITE_ID,
      team_id: DEMO_TEAM_ID,
      name: "Acme Docs",
      domain: "docs.acme.dev",
      site_key: "demo00000000000000000001",
      exclude_patterns: JSON.stringify(["/wp-*"]),
      created_at: at - 90 * DAY,
      digest_minutes: 15,
      crawl_enabled: 1,
      crawl_max_pages: 250,
      last_crawl_at: lastCrawl,
      crawl_pages: 64,
    }),
    db.insert(websites).values({
      id: DEMO_MARKETING_ID,
      team_id: DEMO_TEAM_ID,
      name: "acme.dev",
      domain: "acme.dev",
      site_key: "demo00000000000000000002",
      created_at: at - 60 * DAY,
      digest_minutes: 60,
      crawl_enabled: 1,
      crawl_max_pages: 100,
      last_crawl_at: at - 9 * HOUR,
      crawl_pages: 23,
    }),
  );

  // --- known pages (what a sitemap import + crawl produce) ---
  const docsPages: [string, string][] = [
    ["/docs/getting-started", "Getting started · Acme Docs"],
    ["/docs/installation", "Installation · Acme Docs"],
    ["/docs/configuration", "Configuration · Acme Docs"],
    ["/docs/api/authentication", "API authentication · Acme Docs"],
    ["/docs/api/webhooks", "Webhooks · Acme Docs"],
    ["/docs/api/rate-limits", "Rate limits · Acme Docs"],
    ["/docs/guides/deploy-cloudflare", "Deploy to Cloudflare · Acme Docs"],
    ["/docs/guides/deploy-vercel", "Deploy to Vercel · Acme Docs"],
    ["/docs/cli", "CLI reference · Acme Docs"],
    ["/docs/sdk/javascript", "JavaScript SDK · Acme Docs"],
    ["/docs/sdk/python", "Python SDK · Acme Docs"],
    ["/blog/introducing-acme-2", "Introducing Acme 2.0 · Acme Blog"],
    ["/blog/pricing-update", "A simpler pricing model · Acme Blog"],
    ["/changelog", "Changelog · Acme Docs"],
  ];
  const marketingPages: [string, string][] = [
    ["/", "Acme: ship faster"],
    ["/pricing", "Pricing · Acme"],
    ["/customers", "Customers · Acme"],
    ["/about", "About us · Acme"],
    ["/careers", "Careers · Acme"],
    ["/security", "Security · Acme"],
    ["/contact", "Contact sales · Acme"],
  ];
  const docs = (p: string) => `https://docs.acme.dev${p}`;
  const mkt = (p: string) => `https://acme.dev${p}`;
  const known = (siteId: string, base: (p: string) => string, pages: [string, string][]) =>
    pages.forEach(([path, title], i) =>
      stmts.push(
        db.insert(knownUrls).values({
          id: `${siteId}-page-${i}`,
          website_id: siteId,
          url: base(path),
          title,
          source: i % 3 === 0 ? "crawler" : "sitemap",
          added_at: at - 30 * DAY,
          title_checked_at: at - 30 * DAY,
        }),
      ),
    );
  known(DEMO_SITE_ID, docs, docsPages);
  known(DEMO_MARKETING_ID, mkt, marketingPages);

  // --- visitor 404s: raw events over 30 days + the managed link per URL ---
  type VisitorLink = {
    url: string;
    hits: number;
    referrers: string[];
    /** hours ago of the newest hit */
    newest: number;
    status?: "resolved" | "ignored";
    suggested?: [string, string];
    title?: string;
  };
  const visitorLinks = (siteId: string, links: VisitorLink[]) => {
    for (const [li, l] of links.entries()) {
      const times: number[] = [];
      for (let i = 0; i < l.hits; i++) {
        // the newest hit lands where it says; the rest skew towards recent days
        const ago = i === 0 ? l.newest * HOUR : l.newest * HOUR + rand() ** 1.6 * 29 * DAY;
        times.push(Math.round(at - Math.min(ago, 29.5 * DAY)));
      }
      times.forEach((ts, i) =>
        stmts.push(
          db.insert(notFoundEvents).values({
            id: `${siteId}-evt-${li}-${i}`,
            website_id: siteId,
            url: l.url,
            referrer:
              l.referrers.length && rand() < 0.75 ? l.referrers[i % l.referrers.length] : null,
            user_agent: USER_AGENTS[Math.floor(rand() * USER_AGENTS.length)],
            ts,
            title: "404: Page not found",
          }),
        ),
      );
      const first = Math.min(...times);
      const last = Math.max(...times);
      stmts.push(
        db.insert(brokenLinks).values({
          id: `${siteId}-link-v${li}`,
          website_id: siteId,
          url: l.url,
          status: l.status ?? "open",
          source: "visitor",
          hits: l.hits,
          first_seen: first,
          last_seen: last,
          resolved_at: l.status === "resolved" ? last + 3 * HOUR : null,
          suggested_url: l.suggested?.[0] ?? null,
          suggested_title: l.suggested?.[1] ?? null,
          title: l.title ?? null,
        }),
      );
    }
  };
  visitorLinks(DEMO_SITE_ID, [
    {
      url: docs("/docs/getting-startd"),
      hits: 41,
      newest: 1,
      referrers: ["https://www.google.com/", "https://www.bing.com/"],
      suggested: [docs("/docs/getting-started"), docsPages[0][1]],
    },
    {
      url: docs("/docs/instalation"),
      hits: 23,
      newest: 3,
      referrers: [docs("/docs/getting-started"), "https://www.google.com/"],
      suggested: [docs("/docs/installation"), docsPages[1][1]],
    },
    {
      url: docs("/blog/launch-post"),
      hits: 15,
      newest: 7,
      referrers: ["https://news.ycombinator.com/", "https://t.co/"],
      suggested: [docs("/blog/introducing-acme-2"), docsPages[11][1]],
    },
    {
      url: docs("/docs/api/auth"),
      hits: 11,
      newest: 26,
      referrers: ["https://github.com/acme/acme-js", "https://stackoverflow.com/"],
      suggested: [docs("/docs/api/authentication"), docsPages[3][1]],
    },
    {
      url: docs("/docs/guides/deploy-cloudflare-pages"),
      hits: 6,
      newest: 50,
      referrers: ["https://www.reddit.com/", "https://www.google.com/"],
      suggested: [docs("/docs/guides/deploy-cloudflare"), docsPages[6][1]],
    },
    {
      url: docs("/old/cli"),
      hits: 4,
      newest: 80,
      referrers: [docs("/docs/configuration")],
      suggested: [docs("/docs/cli"), docsPages[8][1]],
    },
    {
      url: docs("/docs/sdk/js"),
      hits: 5,
      newest: 30,
      referrers: ["https://www.npmjs.com/"],
      status: "resolved",
      suggested: [docs("/docs/sdk/javascript"), docsPages[9][1]],
    },
    {
      url: docs("/.env.backup"),
      hits: 3,
      newest: 40,
      referrers: [],
      status: "ignored",
    },
  ]);
  visitorLinks(DEMO_MARKETING_ID, [
    {
      url: mkt("/pricing.html"),
      hits: 12,
      newest: 5,
      referrers: ["https://www.google.com/", "https://www.producthunt.com/"],
      suggested: [mkt("/pricing"), marketingPages[1][1]],
    },
    {
      url: mkt("/team"),
      hits: 7,
      newest: 20,
      referrers: ["https://www.linkedin.com/"],
      suggested: [mkt("/about"), marketingPages[3][1]],
    },
    {
      url: mkt("/jobs/senior-engineer"),
      hits: 4,
      newest: 60,
      referrers: ["https://news.ycombinator.com/"],
      suggested: [mkt("/careers"), marketingPages[4][1]],
    },
  ]);

  // --- the last crawl: checks of every link it found, broken ones on the list ---
  type Check = {
    url: string;
    status: number;
    on: [string, string, string];
    chain?: { url: string; status: number }[];
  };
  const crawl = (siteId: string, ranAt: number, checks: Check[]) =>
    checks.forEach((ch, i) => {
      const checkedAt = ranAt + MIN + i * 7_000;
      const ok = ch.status < 400;
      stmts.push(
        db.insert(linkChecks).values({
          id: `${siteId}-check-${i}`,
          website_id: siteId,
          url: ch.url,
          status: ch.status,
          ok: ok ? 1 : 0,
          redirect_chain: ch.chain ? JSON.stringify(ch.chain) : null,
          checked_at: checkedAt,
        }),
        db.insert(crawlSources).values({
          website_id: siteId,
          source_url: ch.on[0],
          source_title: ch.on[1],
          target_url: ch.url,
          anchor: ch.on[2],
        }),
      );
      if (!ok)
        stmts.push(
          db.insert(brokenLinks).values({
            id: `${siteId}-link-c${i}`,
            website_id: siteId,
            url: ch.url,
            status: "open",
            source: "crawler",
            hits: 0,
            http_status: ch.status,
            first_seen: checkedAt - (i % 3) * 3 * DAY,
            last_seen: checkedAt,
            found_on: ch.on[0],
            found_on_title: ch.on[1],
            anchor: ch.on[2],
          }),
        );
    });
  const gs: [string, string] = [docs("/docs/getting-started"), docsPages[0][1]];
  const cl: [string, string] = [docs("/changelog"), docsPages[13][1]];
  const wh: [string, string] = [docs("/docs/api/webhooks"), docsPages[4][1]];
  crawl(DEMO_SITE_ID, lastCrawl, [
    { url: docs("/docs/installation"), status: 200, on: [...gs, "Install Acme"] },
    { url: docs("/docs/configuration"), status: 200, on: [...gs, "Configuration"] },
    { url: docs("/docs/api/webhooks"), status: 200, on: [...gs, "Webhooks"] },
    { url: docs("/docs/cli"), status: 200, on: [...gs, "the CLI"] },
    { url: docs("/changelog"), status: 200, on: [...gs, "What's new"] },
    {
      url: "https://github.com/acme/acme",
      status: 200,
      on: [...gs, "GitHub"],
      chain: [
        { url: "https://github.com/acme/acme", status: 301 },
        { url: "https://github.com/acme-inc/acme", status: 200 },
      ],
    },
    { url: docs("/docs/api/v1/keys"), status: 404, on: [...wh, "API keys"] },
    { url: docs("/assets/architecture-old.png"), status: 404, on: [...cl, "architecture diagram"] },
    { url: docs("/legacy/download"), status: 410, on: [...cl, "Download v1"] },
    { url: "https://status.acme-legacy.io/", status: 503, on: [...gs, "status page"] },
    { url: docs("/docs/sdk/ruby"), status: 404, on: [...gs, "Ruby SDK"] },
  ]);
  const home: [string, string] = [mkt("/"), marketingPages[0][1]];
  crawl(DEMO_MARKETING_ID, at - 9 * HOUR, [
    { url: mkt("/pricing"), status: 200, on: [...home, "Pricing"] },
    { url: mkt("/customers"), status: 200, on: [...home, "Customers"] },
    { url: docs("/docs/getting-started"), status: 200, on: [...home, "Docs"] },
    {
      url: mkt("/press-kit.zip"),
      status: 404,
      on: [mkt("/about"), marketingPages[3][1], "Press kit"],
    },
  ]);

  // --- notifications: two channels and what they were sent ---
  stmts.push(
    db.insert(alertChannels).values({
      id: "demo-channel-slack",
      team_id: DEMO_TEAM_ID,
      type: "slack",
      name: "#web-alerts",
      config: JSON.stringify({ url: "https://hooks.slack.com/services/T0000/B0000/demo" }),
      created_at: at - 80 * DAY,
    }),
    db.insert(alertChannels).values({
      id: "demo-channel-email",
      team_id: DEMO_TEAM_ID,
      type: "email",
      name: "Docs team",
      config: JSON.stringify({ to: "docs@acme.dev" }),
      created_at: at - 70 * DAY,
    }),
  );
  const sent: [string, string, string, number][] = [
    [
      DEMO_SITE_ID,
      "demo-channel-slack",
      "2 new broken links: /docs/getting-startd (9 hits), /docs/instalation (3 hits)",
      1,
    ],
    [
      DEMO_SITE_ID,
      "demo-channel-email",
      "2 new broken links: /docs/getting-startd (9 hits), /docs/instalation (3 hits)",
      1,
    ],
    [DEMO_SITE_ID, "demo-channel-slack", "Crawl found 4 broken links on docs.acme.dev", 2],
    [DEMO_SITE_ID, "demo-channel-slack", "1 new broken link: /blog/launch-post (6 hits)", 8],
    [DEMO_MARKETING_ID, "demo-channel-slack", "1 new broken link: /pricing.html (4 hits)", 6],
  ];
  sent.forEach(([siteId, channel, summary, hoursAgo], i) =>
    stmts.push(
      db.insert(alerts).values({
        id: `demo-alert-${i}`,
        website_id: siteId,
        channel_id: channel,
        summary,
        sent_at: at - hoursAgo * HOUR,
      }),
    ),
  );

  // D1 batch limits: the wipe runs first, then the rows in batches of 50
  for (let i = 0; i < stmts.length; i += 50) await batchAll(stmts.slice(i, i + 50));
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
];

/** A tiny seeded PRNG: the same demo every time it is written. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
