// Scheduled (cron) + queue consumer handlers for the crawler.
import { getSite, startCrawl, fetchPage, checkLink, notifyDigest } from './server/features/crawl/service';
import { pruneEvents } from './server/features/events/retention';
import type { CrawlMessage, Env } from './types';

const CRAWL_CRON = '*/30 * * * *';
const RETENTION_CRON = '17 3 * * *';

/** Cron: nightly retention, or enqueue crawl-site for every site with crawling enabled. */
export async function scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  if (controller.cron === RETENTION_CRON) {
    const { deleted, checksDeleted } = await pruneEvents(env);
    console.log(`[404less] retention pruned ${deleted} events, ${checksDeleted} link checks`);
    return;
  }
  if (controller.cron !== CRAWL_CRON && controller.cron !== '') return;
  const sites = await env.DB.prepare('SELECT id FROM websites WHERE crawl_enabled = 1').all<{ id: string }>();
  const messages = sites.results.map((s) => ({ body: { kind: 'crawl-site', siteId: s.id } as CrawlMessage }));
  if (messages.length) await env.CRAWLQ.sendBatch(messages);
}

async function sendAll(env: Env, messages: CrawlMessage[]): Promise<void> {
  // budget guard: cap batch size to protect free-tier queue limits
  for (let i = 0; i < messages.length; i += 50) {
    await env.CRAWLQ.sendBatch(messages.slice(i, i + 50).map((b) => ({ body: b })));
  }
}

/** Queue consumer: process crawl messages, enqueue follow-ups in batches. */
export async function queue(batch: MessageBatch<CrawlMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
  // politeness: process sites' messages sequentially within the batch
  for (const msg of batch.messages) {
    const m = msg.body;
    try {
      const site = await getSite(env, m.siteId);
      // manual "crawl now" works with scheduling off; scheduled runs require it on
      if (!site || (m.kind === 'crawl-site' && !site.crawl_enabled && !m.manual)) { msg.ack(); continue; }
      if (m.kind === 'crawl-site') {
        await sendAll(env, await startCrawl(env, site));
      } else if (m.kind === 'fetch-page') {
        await sendAll(env, await fetchPage(env, site, m.url, m.depth));
      } else if (m.kind === 'check-link') {
        const alert = await checkLink(env, site, m);
        if (alert) ctx.waitUntil(notifyDigest(env, site.id, m.url, m.sourceUrl));
      }
      msg.ack();
    } catch (err) {
      console.error('crawl message failed', JSON.stringify(m), err);
      msg.retry();
    }
  }
}
