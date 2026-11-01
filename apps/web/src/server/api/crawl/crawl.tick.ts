// The crawl tick: all background crawl work, driven by the clock instead of a
// message queue, so 404less fits Cloudflare's Free plan (Queues there allow
// 10,000 operations a day, and one crawl of a modest site sends more messages
// than that).
//
// One tick: start the runs that are due, work through each running site's
// crawl_tasks in id order (round-robin across sites), finish runs with nothing
// left, then spend what is left on the title backlog. The Worker's cron calls
// it every minute; "Crawl now", a sitemap import and the dashboard's polling
// while a crawl runs call it right away (in the request's waitUntil), so a
// crawl someone is watching moves fast and an unwatched one still finishes.
//
// Budgets per tick keep each invocation inside Free-plan limits: at most
// SLICE.fetches outbound requests (the plan allows 50), a few pages parsed
// (CPU), and a wall-clock deadline. A tick that runs out stops between tasks;
// the next tick carries on from the site's cursor. One tick runs at a time,
// across isolates, through a lease row in kv. An idle tick only reads.
import type { ScheduledController } from "@cloudflare/workers-types";
import { and, asc, eq, exists, gt, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { kv } from "@groot/core/database";
import { logger } from "@groot/core/logger";
import { batch, crawlSources, crawlTasks, db, knownUrls, websites } from "../../db";
import { pruneEvents } from "../events/retention.service";
import type { Env } from "../../types";
import {
  checkLink,
  fetchPage,
  fetchTitles,
  getSite,
  notifyDigest,
  startRun,
  type CrawlSiteRow,
  type CrawlTask,
} from "./crawl.service";
import { SubrequestBudgetSpent, subrequestsLeft, withSubrequestBudget } from "./subrequests";

const RETENTION_CRON = "17 3 * * *";

export type TickSlice = {
  /** Outbound fetches (Workers Free: 50 per invocation, some kept in reserve). */
  fetches: number;
  /** Pages fetched and parsed: the CPU-heavy task. */
  pages: number;
  /** Stop starting tasks after this long. */
  ms: number;
  /** How long the lease holds if the tick dies without releasing it. */
  leaseMs: number;
};

/** The cron's tick: once a minute, so it stops well before the next one. */
export const CRON_SLICE: TickSlice = { fetches: 40, pages: 5, ms: 40_000, leaseMs: 120_000 };
/** A tick in a request's waitUntil, which Workers allow 30 s after the response. */
export const INLINE_SLICE: TickSlice = { fetches: 40, pages: 5, ms: 15_000, leaseMs: 45_000 };

/** Tasks read per site per round. */
const CHUNK = 10;
/** A task that throws this many times is skipped. */
const MAX_ATTEMPTS = 3;
/** Fetches to keep in hand before starting a task (robots.txt + page; a check and one retry). */
const PAGE_COST = 2;
const LINK_COST = 2;
/** Titles fetched per round (one fetch each). */
const TITLES_PER_ROUND = 10;
const LEASE_KEY = "crawl:tick:lease";

const DEFAULT_INTERVAL_HOURS = 24;

/** How often a site with scheduled crawling on is crawled: CRAWL_INTERVAL_HOURS, default daily. */
export function crawlIntervalHours(env: Pick<Env, "CRAWL_INTERVAL_HOURS">): number {
  const hours = Number(env.CRAWL_INTERVAL_HOURS);
  return Number.isFinite(hours) && hours >= 0.25 ? hours : DEFAULT_INTERVAL_HOURS;
}

/** Cron: the nightly retention prune, or a crawl tick (every other schedule). */
export async function runScheduled(
  controller: Pick<ScheduledController, "cron">,
  env: Env,
): Promise<void> {
  if (controller.cron === RETENTION_CRON) {
    const { deleted, checksDeleted } = await pruneEvents(env);
    console.log(`[404less] retention pruned ${deleted} events, ${checksDeleted} link checks`);
    return;
  }
  await crawlTick(env, CRON_SLICE);
}

export type TickResult = {
  /** idle: nothing to do; busy: another tick holds the lease. */
  state: "idle" | "busy" | "ran";
  started: number;
  tasks: number;
  finished: number;
  titles: number;
};

/** Run one crawl tick. Never throws: errors are logged. */
export async function crawlTick(env: Env, slice: TickSlice = CRON_SLICE): Promise<TickResult> {
  const result: TickResult = { state: "idle", started: 0, tasks: 0, finished: 0, titles: 0 };
  try {
    const now = Date.now();
    const work = await findWork(env, now);
    if (!work) return result;
    const lease = await claimLease(now, slice.leaseMs);
    if (!lease) return { ...result, state: "busy" };
    result.state = "ran";
    try {
      await withSubrequestBudget(slice.fetches, () =>
        drain(env, slice, work, now + slice.ms, result),
      );
    } finally {
      await releaseLease(lease);
    }
  } catch (error) {
    logger.error({ err: error }, "crawl tick failed");
  }
  return result;
}

type Work = { due: string[]; running: string[]; titles: boolean };

/** What there is to do, from reads only; null when nothing. */
async function findWork(env: Env, now: number): Promise<Work | null> {
  const sites = await db
    .select({
      id: websites.id,
      crawl_enabled: websites.crawl_enabled,
      crawl_cursor: websites.crawl_cursor,
      last_crawl_at: websites.last_crawl_at,
    })
    .from(websites);
  const dueBefore = now - crawlIntervalHours(env) * 3_600_000;
  const due = sites
    .filter(
      (s) =>
        s.crawl_enabled === 1 &&
        s.crawl_cursor === null &&
        (s.last_crawl_at === null || s.last_crawl_at <= dueBefore),
    )
    .map((s) => s.id);
  const running = sites.filter((s) => s.crawl_cursor !== null).map((s) => s.id);
  const untitled = await db
    .select({ website_id: knownUrls.website_id })
    .from(knownUrls)
    .where(isNull(knownUrls.title_checked_at))
    .limit(1);
  if (!due.length && !running.length && !untitled.length) return null;
  return { due, running, titles: untitled.length > 0 };
}

async function drain(
  env: Env,
  slice: TickSlice,
  work: Work,
  deadline: number,
  result: TickResult,
): Promise<void> {
  const state = { pages: 0, deadline, slice };

  for (const id of work.due) {
    const site = await getSite(env, id);
    if (!site) continue;
    await startRun(env, site);
    result.started++;
    work.running.push(id);
  }

  // round-robin: a chunk of each running site's tasks per round
  let active = [...work.running];
  while (active.length) {
    const next: string[] = [];
    for (const id of active) {
      const outcome = await runChunk(env, id, state, result);
      if (outcome === "out-of-budget") return;
      if (outcome === "more") next.push(id);
    }
    active = next;
  }

  if (!work.titles) return;
  // the title backlog gets what is left, a site at a time
  while (canContinue(state, LINK_COST)) {
    const site = await db
      .select({ website_id: knownUrls.website_id })
      .from(knownUrls)
      .where(isNull(knownUrls.title_checked_at))
      .limit(1)
      .get();
    if (!site) return;
    try {
      await fetchTitles(env, site.website_id, Math.min(TITLES_PER_ROUND, subrequestsLeft()));
    } catch (error) {
      if (error instanceof SubrequestBudgetSpent) return;
      throw error;
    }
    result.titles++;
  }
}

type TickState = { pages: number; deadline: number; slice: TickSlice };

function canContinue(state: TickState, cost: number): boolean {
  return Date.now() < state.deadline && subrequestsLeft() >= cost;
}

/**
 * Run the next few tasks of one site, then save how far it got. "more": tasks
 * remain; "done": the run finished (or is not ours to run this tick);
 * "out-of-budget": the tick should stop.
 */
async function runChunk(
  env: Env,
  siteId: string,
  state: TickState,
  result: TickResult,
): Promise<"more" | "done" | "out-of-budget"> {
  const site = await getSite(env, siteId);
  if (!site || site.crawl_cursor === null) return "done";
  const startCursor = site.crawl_cursor;
  const startPages = site.crawl_pages;
  const tasks = await db
    .select()
    .from(crawlTasks)
    .where(and(eq(crawlTasks.website_id, site.id), gt(crawlTasks.id, startCursor)))
    .orderBy(asc(crawlTasks.id))
    .limit(CHUNK);
  if (!tasks.length) {
    if (await finishRun(site)) result.finished++;
    return "done";
  }

  let cursor = startCursor;
  let outcome: "more" | "done" | "out-of-budget" = "more";
  for (const task of tasks) {
    const isPage = task.kind === "page";
    if (
      !canContinue(state, isPage ? PAGE_COST : LINK_COST) ||
      (isPage && state.pages >= state.slice.pages)
    ) {
      outcome = "out-of-budget";
      break;
    }
    try {
      await runTask(env, site, task, state);
      cursor = task.id;
      result.tasks++;
    } catch (error) {
      if (error instanceof SubrequestBudgetSpent) {
        outcome = "out-of-budget"; // this task runs again next tick
        break;
      }
      logger.error({ err: error, task }, "crawl task failed");
      if (task.attempts + 1 >= MAX_ATTEMPTS) {
        cursor = task.id; // give up on it
        continue;
      }
      await db
        .update(crawlTasks)
        .set({ attempts: task.attempts + 1 })
        .where(eq(crawlTasks.id, task.id));
      outcome = "done"; // leave this site for the next tick
      break;
    }
  }

  if (cursor !== startCursor || site.crawl_pages !== startPages) {
    // only while the run is still the one we loaded: "Crawl now" may have restarted it
    await db
      .update(websites)
      .set({ crawl_cursor: cursor, crawl_pages: site.crawl_pages })
      .where(and(eq(websites.id, site.id), sameRun(site)));
  }
  return outcome;
}

async function runTask(
  env: Env,
  site: CrawlSiteRow,
  task: CrawlTask,
  state: TickState,
): Promise<void> {
  if (task.kind === "page") {
    state.pages++;
    site.crawl_pages += await fetchPage(env, site, task.url, task.depth);
    return;
  }
  const alert = await checkLink(env, site, task);
  if (alert) {
    await notifyDigest(env, site.id, task.url, task.source_url).catch((error: unknown) =>
      logger.error({ err: error }, "digest notify failed"),
    );
  }
}

function sameRun(site: CrawlSiteRow) {
  return and(
    isNotNull(websites.crawl_cursor),
    site.last_crawl_at === null
      ? isNull(websites.last_crawl_at)
      : eq(websites.last_crawl_at, site.last_crawl_at),
  );
}

/**
 * End a run with no tasks left: links on pages this run no longer reached are
 * dropped from crawl_sources (a run that fetched no pages keeps them all), and
 * the run's tasks are deleted.
 */
async function finishRun(site: CrawlSiteRow): Promise<boolean> {
  const ended = await db
    .update(websites)
    .set({ crawl_cursor: null })
    .where(and(eq(websites.id, site.id), sameRun(site)))
    .returning({ id: websites.id });
  if (!ended.length) return false;
  const pagesThisRun = db
    .select({ url: crawlTasks.url })
    .from(crawlTasks)
    .where(and(eq(crawlTasks.website_id, site.id), eq(crawlTasks.kind, "page")));
  await batch([
    db
      .delete(crawlSources)
      .where(
        and(
          eq(crawlSources.website_id, site.id),
          exists(pagesThisRun),
          notInArray(crawlSources.source_url, pagesThisRun),
        ),
      ),
    db.delete(crawlTasks).where(eq(crawlTasks.website_id, site.id)),
  ]);
  return true;
}

/** Take the tick lease unless another tick holds an unexpired one. */
async function claimLease(now: number, ms: number): Promise<string | null> {
  const token = JSON.stringify(crypto.randomUUID());
  const expiresAt = new Date(now + ms);
  const rows = await db
    .insert(kv)
    .values({ key: LEASE_KEY, value: token, expiresAt })
    .onConflictDoUpdate({
      target: kv.key,
      set: { value: token, expiresAt },
      setWhere: sql`${kv.expiresAt} IS NULL OR ${kv.expiresAt} <= ${now}`,
    })
    .returning({ key: kv.key });
  return rows.length ? token : null;
}

async function releaseLease(token: string): Promise<void> {
  await db.delete(kv).where(and(eq(kv.key, LEASE_KEY), eq(kv.value, token)));
}
