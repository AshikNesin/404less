// Driving the crawl tick from tests: no queue, so a test sets up a run's tasks
// and ticks until there is nothing left to do.
import { env } from "cloudflare:test";
import { queueTasks } from "../../apps/web/src/server/api/crawl/crawl.service";
import {
  CRON_SLICE,
  crawlTick,
  type TickSlice,
} from "../../apps/web/src/server/api/crawl/crawl.tick";

type Task = Parameters<typeof queueTasks>[1][number];

/** Start a fresh run of `siteId` holding exactly these tasks. */
export async function startTestRun(siteId: string, tasks: Task[]): Promise<void> {
  await env.DB.prepare("DELETE FROM crawl_tasks WHERE website_id = ?").bind(siteId).run();
  await env.DB.prepare(
    "UPDATE websites SET crawl_cursor = 0, crawl_pages = ?, last_crawl_at = ? WHERE id = ?",
  )
    .bind(tasks.filter((t) => t.kind === "page").length, Date.now(), siteId)
    .run();
  await queueTasks(siteId, tasks);
}

/** One tick with the given limits. */
export function tick(slice: Partial<TickSlice> = {}) {
  return crawlTick(env as never, { ...CRON_SLICE, ...slice });
}

/** Tick until no work is left (waiting out a tick another request is running). */
export async function drainCrawl(slice: Partial<TickSlice> = {}): Promise<number> {
  for (let ticks = 1; ticks <= 200; ticks++) {
    const result = await tick(slice);
    if (result.state === "idle") return ticks;
    if (result.state === "busy") await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("the crawl still has work after 200 ticks");
}

export async function siteRun(siteId: string) {
  return env.DB.prepare(
    "SELECT crawl_cursor, crawl_pages, last_crawl_at FROM websites WHERE id = ?",
  )
    .bind(siteId)
    .first<{ crawl_cursor: number | null; crawl_pages: number; last_crawl_at: number | null }>();
}

export async function tasksOf(siteId: string) {
  const rows = await env.DB.prepare(
    "SELECT kind, url, depth, source_url, found_on_page FROM crawl_tasks WHERE website_id = ? ORDER BY id",
  )
    .bind(siteId)
    .all<{
      kind: string;
      url: string;
      depth: number;
      source_url: string | null;
      found_on_page: number;
    }>();
  return rows.results;
}
