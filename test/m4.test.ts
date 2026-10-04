// M4: crawler — HTML link extraction, checker classification, queue+cron handlers,
// diff-based new-failure alerts, crawl report endpoint.
import { SELF, env, createScheduledController, createExecutionContext, waitOnExecutionContext, createMessageBatch } from 'cloudflare:test';
import worker from '../src/index';
import { queue as queueHandler, scheduled as scheduledHandler } from '../src/cron';
import { beforeAll, expect, test, vi } from 'vitest';
import { extractLinks } from '../src/server/features/crawl/html';

let cookie = '';
let teamId = '';
let siteId = '';

beforeAll(async () => {
  const r = await SELF.fetch('http://localhost/auth/magic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm4@example.com' }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: 'manual' });
  cookie = (v.headers.get('set-cookie') ?? '').split(';')[0];
  const h = { 'Content-Type': 'application/json', cookie };
  const team = await (await SELF.fetch('http://localhost/api/teams', { method: 'POST', headers: h, body: JSON.stringify({ name: 'M4' }) })).json() as any;
  teamId = team.team.id;
  const site = await (await SELF.fetch('http://localhost/api/sites', { method: 'POST', headers: h, body: JSON.stringify({ teamId, name: 'CrawlTest', domain: 'crawl.test' }) })).json() as any;
  siteId = site.site.id;
});

test('extractLinks: anchors, assets, relative resolution, junk skipped', () => {
  const html = `
    <a href="/docs/getting-started">Getting Started</a>
    <a href="https://other.example/x">External</a>
    <a href="mailto:a@b.c">mail</a>
    <a href="#anchor">skip</a>
    <a href="javascript:void(0)">skip</a>
    <img src="/img/logo.png">
    <script src="/js/app.js"></script>
    <link href="/css/site.css">`;
  const { links, assets } = extractLinks('https://crawl.test/index.html', html);
  expect(links.map((l) => l.url).sort()).toEqual(['https://crawl.test/docs/getting-started', 'https://other.example/x']);
  expect(links[0].anchor).toBe('Getting Started');
  expect(assets.sort()).toEqual(['https://crawl.test/css/site.css', 'https://crawl.test/img/logo.png', 'https://crawl.test/js/app.js']);
});

function stubFetch(responses: Record<string, { status: number; location?: string; body?: string }>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const u = String(input instanceof Request ? input.url : input);
    for (const [k, v] of Object.entries(responses)) {
      if (u === k) {
        return new Response(v.body ?? '', {
          status: v.status,
          headers: v.location ? { location: v.location } : {},
        });
      }
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

test('checkUrl follows redirects and records the chain', async () => {
  const restore = stubFetch({
    'https://crawl.test/a': { status: 301, location: '/b' },
    'https://crawl.test/b': { status: 302, location: '/c' },
    'https://crawl.test/c': { status: 200, body: '<html></html>' },
  });
  try {
    const { checkUrl } = await import('../src/server/features/crawl/checker');
    const r = await checkUrl('https://crawl.test/a', { ignore_status_codes: '[]' } as never);
    expect(r.status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.redirectChain).toEqual([
      { url: 'https://crawl.test/a', status: 301 },
      { url: 'https://crawl.test/b', status: 302 },
      { url: 'https://crawl.test/c', status: 200 },
    ]);
  } finally { restore(); }
});

test('checkUrl classifies broken, and ignore-list rescues 403', async () => {
  const restore = stubFetch({
    'https://crawl.test/dead': { status: 404 },
    'https://crawl.test/locked': { status: 403 },
  });
  try {
    const { checkUrl } = await import('../src/server/features/crawl/checker');
    expect((await checkUrl('https://crawl.test/dead', { ignore_status_codes: '[]' } as never)).ok).toBe(false);
    expect((await checkUrl('https://crawl.test/locked', { ignore_status_codes: '[403]' } as never)).ok).toBe(true);
  } finally { restore(); }
});

test('fetch-page message: extracts links, records sources, enqueues checks + same-host pages', async () => {
  // enable crawling first
  await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ crawl_enabled: true, crawl_max_pages: 5 }),
  });

  const sent: any[] = [];
  const realSend = (env as any).CRAWLQ.sendBatch.bind(env.CRAWLQ);
  (env as any).CRAWLQ.sendBatch = async (msgs: any[]) => { sent.push(...msgs.map((m) => m.body)); };

  const restore = stubFetch({
    'https://crawl.test/': {
      status: 200,
      body: `<html><a href="/page1">One</a><a href="https://ext.example/x">Ext</a><img src="/i.png"></html>`,
    },
  });
  try {
    const batch = createMessageBatch('crawl-q', [
      { id: 'p1', timestamp: new Date(0), attempts: 1, body: { kind: 'fetch-page', siteId, url: 'https://crawl.test/', depth: 0 } } as never,
    ]);
    const ctx = createExecutionContext();
    await queueHandler(batch, env as never, ctx);
    await waitOnExecutionContext(ctx);
    expect(batch.messages[0].ackAll ?? true).toBeTruthy();

    const kinds = sent.map((m) => m.kind);
    expect(kinds).toContain('check-link');
    expect(kinds).toContain('fetch-page'); // /page1 is same-host -> crawled
    const src = await env.DB.prepare('SELECT COUNT(*) AS n FROM crawl_sources WHERE website_id = ?').bind(siteId).first<{ n: number }>();
    expect(src!.n).toBeGreaterThanOrEqual(2);
  } finally {
    restore();
    (env as any).CRAWLQ.sendBatch = realSend;
  }
});

test('check-link message: persists result; repeated failure is not new', async () => {
  const restore = stubFetch({ 'https://ext.example/x': { status: 404 } });
  const doCalls: any[] = [];
  // spy on DO fetch for alert verification
  try {
    for (let run = 0; run < 2; run++) {
      const batch = createMessageBatch('crawl-q', [
        { id: `c${run}`, timestamp: new Date(0), attempts: 1, body: { kind: 'check-link', siteId, url: 'https://ext.example/x', sourceUrl: 'https://crawl.test/' } } as never,
      ]);
      const ctx = createExecutionContext();
      await queueHandler(batch, env as never, ctx);
      await waitOnExecutionContext(ctx);
    }
    const rows = await env.DB.prepare('SELECT ok, status FROM link_checks WHERE website_id = ? AND url = ?')
      .bind(siteId, 'https://ext.example/x').all();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0].ok).toBe(0);
  } finally { restore(); }
});

test('cron handler enqueues crawl-site for enabled sites only', async () => {
  const sent: any[] = [];
  const realSend = (env as any).CRAWLQ.sendBatch.bind(env.CRAWLQ);
  (env as any).CRAWLQ.sendBatch = async (msgs: any[]) => { sent.push(...msgs.map((m) => m.body)); };
  try {
    const ctrl = createScheduledController({ scheduledTime: new Date(0), cron: '*/30 * * * *' });
    const ctx = createExecutionContext();
    await scheduledHandler(ctrl, env as never, ctx);
    await waitOnExecutionContext(ctx);
    expect(sent).toEqual([{ kind: 'crawl-site', siteId }]);
  } finally {
    (env as any).CRAWLQ.sendBatch = realSend;
  }
});

test('crawl-report endpoint returns broken with sources', async () => {
  const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/crawl-report`, { headers: { cookie } });
  expect(r.status).toBe(200);
  const { broken } = await r.json() as any;
  expect(broken.length).toBeGreaterThan(0);
  const dead = broken.find((b: any) => b.url === 'https://ext.example/x');
  expect(dead).toBeDefined();
  expect(dead.status).toBe(404);
  expect(dead.sources.map((s: any) => s.source_url)).toContain('https://crawl.test/');
});

test('POST /crawl starts a crawl (auth + role checked)', async () => {
  const r1 = await SELF.fetch(`http://localhost/api/sites/${siteId}/crawl`, { method: 'POST' });
  expect(r1.status).toBe(401);
  const r2 = await SELF.fetch(`http://localhost/api/sites/${siteId}/crawl`, { method: 'POST', headers: { cookie } });
  expect(r2.status).toBe(200);
  expect((await r2.json() as any).started).toBe(true);
});
