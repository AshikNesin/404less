// D1 (SQLite) schema types for 404less — mirrors migrations/*.sql (typed reference; queries are plain SQL).
import type { InferSelectModel } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
});

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('viewer'),
}, (t) => [
  primaryKey({ columns: [t.teamId, t.userId] }),
]);

export const websites = sqliteTable('websites', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  siteKey: text('site_key').notNull().unique(),
  ignoreStatusCodes: text('ignore_status_codes').notNull().default('[]'),
  excludePatterns: text('exclude_patterns').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
  notifyEnabled: integer('notify_enabled').notNull().default(1),
  digestMinutes: integer('digest_minutes').notNull().default(15),
  crawlEnabled: integer('crawl_enabled').notNull().default(0),
  crawlMaxPages: integer('crawl_max_pages').notNull().default(100),
  lastCrawlAt: integer('last_crawl_at'),
});

export const notFoundEvents = sqliteTable('not_found_events', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull(),
  url: text('url').notNull(),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  ts: integer('ts').notNull(),
});

export const brokenLinks = sqliteTable('broken_links', {
  id: text('id').primaryKey(),
  websiteId: text('website_id').notNull(),
  url: text('url').notNull(),
  status: text('status').notNull().default('open'),      // open|resolved|ignored
  source: text('source').notNull().default('visitor'),   // visitor|crawler|both
  hits: integer('hits').notNull().default(0),
  httpStatus: integer('http_status'),
  firstSeen: integer('first_seen').notNull(),
  lastSeen: integer('last_seen').notNull(),
  resolvedAt: integer('resolved_at'),
  suggestedUrl: text('suggested_url'),
  suggestedTitle: text('suggested_title'),
});

export const magicTokens = sqliteTable('magic_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type User = InferSelectModel<typeof users>;
export type Website = InferSelectModel<typeof websites>;
export type NotFoundEvent = InferSelectModel<typeof notFoundEvents>;
export type BrokenLink = InferSelectModel<typeof brokenLinks>;
