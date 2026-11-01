// Workers cron handler: boot the isolate (migrations, groot), then run the
// crawl tick or the nightly retention prune (api/crawl/crawl.tick.ts). Workers only.
import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { runScheduled } from "../api/crawl/crawl.tick";
import type { Env } from "../types";
import { bootWorker } from "./boot";

/** Cron: a crawl tick every minute, retention nightly. */
export async function scheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  await bootWorker(env);
  await runScheduled(controller, env);
}
