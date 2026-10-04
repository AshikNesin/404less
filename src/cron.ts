// Scheduled (cron) + queue consumer handlers for the crawler.
import { getSite, seedUrls, fetchPage, checkLink } from './server/features/crawl/service';
import type { CrawlMessage, Env } from './types';

/** Cron: enqueue crawl-site for every site with crawling enabled. */
export async function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  const sites = await env.DB.prepare('SELECT id FROM websites WHERE crawl_enabled = 1').all<{ id: string }>();
  const messages = sites.results.map((s) => ({ body: { kind: 'crawl-site', siteId: s.id } as CrawlMessage }));
  if (messages.length) await env.CRAWLQ.sendBatch(messages);
}

/** Queue consumer: process crawl messages, enqueue follow-ups in batches. */
export async function queue(batch: MessageBatch<CrawlMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
  // politeness: process sites' messages sequentially within the batch
  for (const msg of batch.messages) {
    const m = msg.body;
    try {
      if (m.kind === 'crawl-site') {
        const site = await getSite(env, m.siteId);
        if (!site || !site.crawl_enabled) { msg.ack(); continue; }
        // fresh run: clear sources, enqueue seed pages (budgeted)
        await env.DB.prepare('DELETE FROM crawl_sources WHERE website_id = ?').bind(site.id).run();
        const seeds = await seedUrls(env, site);
        await env.CRAWLQ.sendBatch(
          seeds.slice(0, site.crawl_max_pages).map((url) => ({ body: { kind: 'fetch-page' as const, siteId: site.id, url, depth: 0 } })),
        );
        msg.ack();
      } else if (m.kind === 'fetch-page') {
        const site = await getSite(env, m.siteId);
        if (!site || !site.crawl_enabled) { msg.ack(); continue; }
        const followUps = await fetchPage(env, site, m.url, m.depth);
        // budget guard: cap enqueued follow-ups per message to protect free-tier queue limits
        for (let i = 0; i < followUps.length; i += 50) {
          await env.CRAWLQ.sendBatch(followUps.slice(i, i + 50).map((b) => ({ body: b })));
        }
        msg.ack();
      } else if (m.kind === 'check-link') {
        const site = await getSite(env, m.siteId);
        if (!site || !site.crawl_enabled) { msg.ack(); continue; }
        const isNewFailure = await checkLink(env, site, m);
        if (isNewFailure) {
          // notify via the per-site digest DO (groups with realtime 404 alerts)
          const doStub = env.DIGEST.get(env.DIGEST.idFromName(site.id));
          ctx.waitUntil(doStub.fetch('https://digest/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: m.url, ts: Date.now(), referrer: m.sourceUrl }),
          }));
        }
        msg.ack();
      } else {
        msg.ack();
      }
    } catch (err) {
      console.error('crawl message failed', JSON.stringify(m), err);
      msg.retry();
    }
  }
}
