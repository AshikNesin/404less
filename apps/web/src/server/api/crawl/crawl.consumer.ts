// Crawl scheduling + queue consumer logic, runtime-neutral: the Workers cron and
// queue handlers (worker/cron.ts) and the Node dev queue (node-bindings.ts) both call it.
import type {
  ExecutionContext,
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types";
import {
  getSite,
  startCrawl,
  fetchPage,
  fetchTitles,
  startTitleJobs,
  checkLink,
  notifyDigest,
} from "./crawl.service";
import { pruneEvents } from "../events/retention.service";
import type { CrawlMessage, Env } from "../../types";
import { eq, isNull } from "drizzle-orm";
import { db, knownUrls, websites } from "../../db";

const CRAWL_CRON = "*/30 * * * *";
const RETENTION_CRON = "17 3 * * *";

/** Cron: nightly retention + title backlog, or enqueue crawl-site for every site with crawling enabled. */
export async function runScheduled(
  controller: Pick<ScheduledController, "cron">,
  env: Env,
): Promise<void> {
  if (controller.cron === RETENTION_CRON) {
    const { deleted, checksDeleted } = await pruneEvents(env);
    console.log(`[404less] retention pruned ${deleted} events, ${checksDeleted} link checks`);
    // resume title fetching for pages still waiting (e.g. rows from before titles were fetched)
    const pending = await db
      .selectDistinct({ website_id: knownUrls.website_id })
      .from(knownUrls)
      .where(isNull(knownUrls.title_checked_at));
    await sendAll(
      env,
      await startTitleJobs(
        env,
        pending.map((r) => r.website_id),
      ),
    );
    return;
  }
  if (controller.cron !== CRAWL_CRON && controller.cron !== "") return;
  const sites = await db
    .select({ id: websites.id })
    .from(websites)
    .where(eq(websites.crawl_enabled, 1));
  await sendAll(
    env,
    sites.map((s): CrawlMessage => ({ kind: "crawl-site", siteId: s.id })),
  );
}

async function sendAll(env: Env, messages: CrawlMessage[]): Promise<void> {
  // budget guard: cap batch size to protect free-tier queue limits
  for (let i = 0; i < messages.length; i += 50) {
    await env.CRAWLQ.sendBatch(messages.slice(i, i + 50).map((b) => ({ body: b })));
  }
}

/** Queue consumer: process crawl messages, enqueue follow-ups in batches. */
export async function consumeCrawlBatch(
  batch: Pick<MessageBatch<CrawlMessage>, "messages">,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<void> {
  // politeness: process sites' messages sequentially within the batch
  for (const msg of batch.messages) {
    const m = msg.body;
    try {
      const site = await getSite(env, m.siteId);
      // manual "crawl now" works with scheduling off; scheduled runs require it on
      if (!site || (m.kind === "crawl-site" && !site.crawl_enabled && !m.manual)) {
        msg.ack();
        continue;
      }
      if (m.kind === "crawl-site") {
        await sendAll(env, await startCrawl(env, site));
      } else if (m.kind === "fetch-page") {
        await sendAll(env, await fetchPage(env, site, m.url, m.depth));
      } else if (m.kind === "fetch-titles") {
        await sendAll(env, await fetchTitles(env, site, m.job));
      } else if (m.kind === "check-link") {
        const alert = await checkLink(env, site, m);
        if (alert) ctx.waitUntil(notifyDigest(env, site.id, m.url, m.sourceUrl));
      }
      msg.ack();
    } catch (err) {
      console.error("crawl message failed", JSON.stringify(m), err);
      msg.retry();
    }
  }
}
