// Workers cron + queue handlers: boot the isolate (migrations, groot), then run
// the crawl logic in api/crawl/crawl.consumer.ts. Workers only.
import type {
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";
import { consumeCrawlBatch, runScheduled } from "../api/crawl/crawl.consumer";
import type { CrawlMessage, Env } from "../types";
import { bootWorker } from "./boot";

/** Cron: nightly retention + title backlog, or enqueue crawl-site for every site with crawling enabled. */
export async function scheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  await bootWorker(env);
  await runScheduled(controller, env);
}

/** Queue consumer: process crawl messages, enqueue follow-ups in batches. */
export async function queue(
  batch: MessageBatch<CrawlMessage>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  await bootWorker(env);
  await consumeCrawlBatch(batch, env, ctx);
}
