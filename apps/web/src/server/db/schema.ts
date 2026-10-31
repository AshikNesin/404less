import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { kv } from "@groot/core/database/schema";

/**
 * 404less tables. This file is the single schema entry point for drizzle-kit
 * (see `drizzle.config.ts`).
 *
 * History: 0001–0007 in `apps/web/drizzle/` are the hand-written migrations
 * from before groot; production D1 recorded them by file name in
 * `d1_migrations`, so they must never be renamed or regenerated. This schema
 * mirrors the database those files produce (column order included), and
 * `meta/0007_snapshot.json` is its drizzle-kit snapshot, so `pnpm db:generate`
 * diffs from there and new migrations start at 0008.
 *
 * Core's `users`/`passkeys` tables are deliberately NOT re-exported: 404less
 * has its own `users` table (text ids, magic-link auth) and does not mount
 * core auth. Re-exporting them would make drizzle-kit rewrite `users`.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  created_at: integer("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner_user_id: text("owner_user_id")
    .notNull()
    .references(() => users.id),
  created_at: integer("created_at").notNull(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    team_id: text("team_id")
      .notNull()
      .references(() => teams.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    /** owner | admin | viewer */
    role: text("role").notNull().default("viewer"),
  },
  (t) => [primaryKey({ columns: [t.team_id, t.user_id] })],
);

/** Quota: max sites per team (`MAX_SITES_PER_TEAM`, default 5), enforced in app code. */
export const websites = sqliteTable("websites", {
  id: text("id").primaryKey(),
  team_id: text("team_id")
    .notNull()
    .references(() => teams.id),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  site_key: text("site_key").notNull().unique(),
  /** JSON array, e.g. [403,405] */
  ignore_status_codes: text("ignore_status_codes").notNull().default("[]"),
  /** JSON array of glob-ish patterns */
  exclude_patterns: text("exclude_patterns").notNull().default("[]"),
  created_at: integer("created_at").notNull(),
  notify_enabled: integer("notify_enabled").notNull().default(1),
  digest_minutes: integer("digest_minutes").notNull().default(15),
  crawl_enabled: integer("crawl_enabled").notNull().default(0),
  crawl_max_pages: integer("crawl_max_pages").notNull().default(100),
  last_crawl_at: integer("last_crawl_at"),
  /** The site's current title job; messages from an older job stop. */
  title_job: text("title_job"),
});

export const notFoundEvents = sqliteTable(
  "not_found_events",
  {
    id: text("id").primaryKey(),
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    url: text("url").notNull(),
    referrer: text("referrer"),
    user_agent: text("user_agent"),
    ts: integer("ts").notNull(),
    title: text("title"),
  },
  (t) => [
    index("idx_events_site_time").on(t.website_id, sql`${t.ts} DESC`),
    index("idx_events_site_url").on(t.website_id, t.url),
  ],
);

export const magicTokens = sqliteTable("magic_tokens", {
  token: text("token").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  expires_at: integer("expires_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  team_id: text("team_id")
    .notNull()
    .references(() => teams.id),
  key_hash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  created_at: integer("created_at").notNull(),
});

/** Instance-level settings, e.g. the auto-generated session secret. */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const knownUrls = sqliteTable(
  "known_urls",
  {
    id: text("id").primaryKey(),
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    url: text("url").notNull(),
    title: text("title"),
    /** sitemap | crawl */
    source: text("source").notNull().default("sitemap"),
    added_at: integer("added_at").notNull(),
    /** A finished title fetch, found or not. */
    title_checked_at: integer("title_checked_at"),
  },
  (t) => [
    uniqueIndex("idx_known_urls_site_url").on(t.website_id, t.url),
    index("idx_known_urls_untitled")
      .on(t.website_id)
      .where(sql`title_checked_at IS NULL`),
  ],
);

export const alertChannels = sqliteTable(
  "alert_channels",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id")
      .notNull()
      .references(() => teams.id),
    type: text("type").notNull(),
    name: text("name").notNull().default(""),
    /** JSON per type: {url} | {token,user} | {to} */
    config: text("config").notNull(),
    enabled: integer("enabled").notNull().default(1),
    created_at: integer("created_at").notNull(),
  },
  () => [check("alert_channels_type_check", sql`type IN ('slack','pushover','email')`)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    channel_id: text("channel_id")
      .notNull()
      .references(() => alertChannels.id),
    summary: text("summary").notNull(),
    sent_at: integer("sent_at").notNull(),
  },
  (t) => [index("idx_alerts_site_time").on(t.website_id, sql`${t.sent_at} DESC`)],
);

export const linkChecks = sqliteTable(
  "link_checks",
  {
    id: text("id").primaryKey(),
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    url: text("url").notNull(),
    /** Final HTTP status */
    status: integer("status").notNull(),
    /** 1 = 2xx/3xx-ok */
    ok: integer("ok").notNull(),
    /** JSON array of hops [{url,status}] */
    redirect_chain: text("redirect_chain"),
    checked_at: integer("checked_at").notNull(),
  },
  (t) => [
    index("idx_checks_site_url").on(t.website_id, t.url),
    index("idx_checks_site_time").on(t.website_id, sql`${t.checked_at} DESC`),
  ],
);

export const crawlSources = sqliteTable(
  "crawl_sources",
  {
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    /** Page where the link was found */
    source_url: text("source_url").notNull(),
    /** The link itself */
    target_url: text("target_url").notNull(),
    anchor: text("anchor"),
    source_title: text("source_title"),
  },
  (t) => [
    primaryKey({ columns: [t.website_id, t.source_url, t.target_url] }),
    index("idx_crawl_sources_target").on(t.website_id, t.target_url),
  ],
);

/** One row per (site, url) with a triage status; visitor hits and crawler checks both upsert here. */
export const brokenLinks = sqliteTable(
  "broken_links",
  {
    id: text("id").primaryKey(),
    website_id: text("website_id")
      .notNull()
      .references(() => websites.id),
    url: text("url").notNull(),
    /** open | resolved | ignored */
    status: text("status").notNull().default("open"),
    /** visitor | crawler | both */
    source: text("source").notNull().default("visitor"),
    /** Visitor 404 hits (all time) */
    hits: integer("hits").notNull().default(0),
    /** Last crawler status, NULL if never checked */
    http_status: integer("http_status"),
    first_seen: integer("first_seen").notNull(),
    last_seen: integer("last_seen").notNull(),
    resolved_at: integer("resolved_at"),
    suggested_url: text("suggested_url"),
    suggested_title: text("suggested_title"),
    title: text("title"),
  },
  (t) => [
    uniqueIndex("idx_broken_links_site_url").on(t.website_id, t.url),
    index("idx_broken_links_site_status").on(t.website_id, t.status, sql`${t.last_seen} DESC`),
  ],
);

export type User = typeof users.$inferSelect;
export type Website = typeof websites.$inferSelect;
export type NotFoundEvent = typeof notFoundEvents.$inferSelect;
export type BrokenLink = typeof brokenLinks.$inferSelect;

// Core tables 404less uses. Only `kv`: see the note above about users/passkeys.
export { kv };
