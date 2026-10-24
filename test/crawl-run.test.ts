// One crawl run end to end: each page fetched and each link checked once per run,
// redirects recorded as the page they land on, flaky connections retried, honest counts.
import { SELF, env, createExecutionContext, waitOnExecutionContext, createMessageBatch } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import { queue as queueHandler } from '../src/cron';
import { checkUrl } from '../src/server/features/crawl/checker';
import worker from '../src/index';

let cookie = '';
let siteId = '';
let fetched: string[] = [];

beforeAll(async () => {
  const r = await SELF.fetch('http://localhost/auth/magic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'run@example.com' }),
  });
  const { devLink } = await r.json() as any;
  const v = await SELF.fetch(devLink, { redirect: 'manual' });
  cookie = (v.headers.get('set-cookie') ?? '').split(';')[0];
  const site = await (await SELF.fetch('http://localhost/api/sites', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ name: 'Run', domain: 'localhost:8080' }),
  })).json() as any;
  siteId = site.site.id;
});

const PAGES: Record<string, { status: number; body?: string; location?: string; url?: string }> = {
  'http://localhost:8080/sitemap.xml': { status: 200, body: '<urlset><url><loc>http://localhost:8080/</loc></url><url><loc>http://localhost:8080/about</loc></url></urlset>' },
  'http://localhost:8080/': { status: 200, body: '<title>Home</title><a href="/about">About</a><a href="/gone">Gone</a><a href="/old">Old</a><a href="/away">Away</a>' },
  'http://localhost:8080/about': { status: 200, body: '<title>About</title><a href="/">Home</a><a href="/gone">Gone</a>' },
  'http://localhost:8080/gone': { status: 404 },
  // fetch-page follows redirects (res.url is where it landed); check-link walks them by hand
  'http://localhost:8080/old': { status: 200, url: 'http://localhost:8080/new', body: '<title>New</title>' },
  'http://localhost:8080/away': { status: 200, url: 'https://elsewhere.example/', body: '<title>Elsewhere</title><a href="https://elsewhere.example/x">x</a>' },
  'http://localhost:8080/new': { status: 200, body: '<title>New</title>' },
  'https://elsewhere.example/': { status: 200, body: '<title>Elsewhere</title><a href="https://elsewhere.example/x">x</a>' },
};

function stub() {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    fetched.push(u);
    const p = PAGES[u];
    if (!p) return new Response('nf', { status: 404 });
    if (init?.redirect === 'manual' && p.url) return new Response(null, { status: 301, headers: { location: p.url } });
    const res = new Response(p.body ?? '', { status: p.status, headers: p.location ? { location: p.location } : {} });
    if (p.url && init?.redirect !== 'manual') Object.defineProperty(res, 'url', { value: p.url });
    return res;
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

/** Drain the crawl queue in-process, the way the consumer would. */
async function runQueue(first: unknown[]) {
  const realSend = (env as any).CRAWLQ.sendBatch.bind(env.CRAWLQ);
  let pending: unknown[] = [...first];
  (env as any).CRAWLQ.sendBatch = async (msgs: { body: unknown }[]) => { pending.push(...msgs.map((m) => m.body)); };
  try {
    for (let round = 0; pending.length && round < 20; round++) {
      const msgs = pending.splice(0);
      const batch = createMessageBatch('q', msgs.map((body, i) => ({ id: `${round}-${i}`, timestamp: new Date(0), attempts: 1, body })) as never);
      const ctx = createExecutionContext();
      await queueHandler(batch, env as never, ctx);
      await waitOnExecutionContext(ctx);
    }
  } finally {
    (env as any).CRAWLQ.sendBatch = realSend;
  }
}

test('sitemap import keeps URLs on a domain with a port, and the default sitemap is plain http there', async () => {
  const restore = stub();
  try {
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{}',
    });
    expect(await r.json()).toMatchObject({ ok: true, imported: 2 });
  } finally { restore(); }
});

test('sitemap import says why a sitemap could not be read', async () => {
  const restore = stub();
  try {
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sitemapUrl: 'http://localhost:8080/missing.xml' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json() as any).error).toBe('http://localhost:8080/missing.xml responded with HTTP 404');
  } finally { restore(); }
});

test('a crawl fetches each page and checks each link once, and counts unique URLs', async () => {
  const restore = stub();
  fetched = [];
  try {
    const start = await SELF.fetch(`http://localhost/api/sites/${siteId}/crawl`, { method: 'POST', headers: { cookie } });
    expect(start.status).toBe(200);
    // the run is stamped as soon as it's requested, before the queue picks it up
    expect((await (await SELF.fetch(`http://localhost/api/sites/${siteId}/overview`, { headers: { cookie } })).json() as any).crawl.running).toBe(true);
    await runQueue([{ kind: 'crawl-site', siteId, manual: true }]);
  } finally { restore(); }

  const times = (u: string) => fetched.filter((x) => x === u).length;
  expect(times('http://localhost:8080/gone')).toBe(1); // linked from two pages: checked once, never crawled as a page
  expect(times('http://localhost:8080/robots.txt')).toBe(1);
  expect(times('http://localhost:8080/about')).toBe(2); // fetched as a page once + checked once
  expect(fetched.some((u) => u.startsWith('https://elsewhere.example/x'))).toBe(false); // off-site redirect not crawled

  const known = await env.DB.prepare('SELECT url FROM known_urls WHERE website_id = ? ORDER BY url').bind(siteId).all<{ url: string }>();
  expect(known.results.map((k) => k.url)).toEqual(['http://localhost:8080/', 'http://localhost:8080/about', 'http://localhost:8080/new']);

  const o = await (await SELF.fetch(`http://localhost/api/sites/${siteId}/overview`, { headers: { cookie } })).json() as any;
  const checks = await env.DB.prepare('SELECT COUNT(DISTINCT url) AS n FROM link_checks WHERE website_id = ?').bind(siteId).first<{ n: number }>();
  expect(o.crawl.checked).toBe(checks!.n);
  expect(o.crawl.broken).toBe(1); // /gone
});

test('a seed page answering with a "treat as working" status is not a broken link', async () => {
  PAGES['http://localhost:8080/about'] = { status: 403 };
  await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ ignore_status_codes: [403] }),
  });
  const restore = stub();
  try {
    await SELF.fetch(`http://localhost/api/sites/${siteId}/crawl`, { method: 'POST', headers: { cookie } });
    await runQueue([{ kind: 'crawl-site', siteId, manual: true }]);
  } finally { restore(); }
  const row = await env.DB.prepare('SELECT status FROM broken_links WHERE website_id = ? AND url = ?').bind(siteId, 'http://localhost:8080/about').first();
  expect(row).toBeNull();
});

test('checkUrl retries a dropped connection once', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    if (++calls === 1) throw new Error('Network connection lost.');
    return new Response('ok');
  }) as typeof fetch;
  try {
    const r = await checkUrl('https://flaky.test/', { ignore_status_codes: '[]' });
    expect(r).toMatchObject({ status: 200, ok: true });
    expect(calls).toBe(2);
  } finally { globalThis.fetch = real; }
});

test('overview counts each URL by its latest check (a re-check that passes is not broken)', async () => {
  const site = await env.DB.prepare('SELECT last_crawl_at FROM websites WHERE id = ?').bind(siteId).first<{ last_crawl_at: number }>();
  const insert = (ok: number, at: number) => env.DB.prepare('INSERT INTO link_checks (id, website_id, url, status, ok, checked_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), siteId, 'http://localhost:8080/fixed', ok ? 200 : 404, ok, at).run();
  const before = (await (await SELF.fetch(`http://localhost/api/sites/${siteId}/overview`, { headers: { cookie } })).json() as any).crawl;
  await insert(0, site!.last_crawl_at + 1);
  await insert(1, site!.last_crawl_at + 2);
  const after = (await (await SELF.fetch(`http://localhost/api/sites/${siteId}/overview`, { headers: { cookie } })).json() as any).crawl;
  expect(after.checked).toBe(before.checked + 1);
  expect(after.broken).toBe(before.broken);
});

test('a robots.txt that fails to load is not remembered', async () => {
  const { loadRobots } = await import('../src/server/features/crawl/robots');
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => (++calls === 1 ? new Response('down', { status: 503 }) : new Response('User-agent: *\nDisallow: /private'))) as typeof fetch;
  try {
    expect((await loadRobots('https://robots-flaky.test')).allowed('/private/x')).toBe(true); // unknown: allowed this once
    expect((await loadRobots('https://robots-flaky.test')).allowed('/private/x')).toBe(false); // asked again
    await loadRobots('https://robots-flaky.test');
    expect(calls).toBe(2); // the real rules are cached
  } finally { globalThis.fetch = real; }
});

test('sitemap import explains when every on-site URL carries a query string', async () => {
  PAGES['http://localhost:8080/params.xml'] = { status: 200, body: '<urlset><url><loc>http://localhost:8080/?p=1</loc></url></urlset>' };
  const restore = stub();
  try {
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sitemapUrl: 'http://localhost:8080/params.xml' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json() as any).error).toMatch(/carry a query string/);
  } finally { restore(); }
});

test('"crawl now" keeps the previous run current when nothing could be queued', async () => {
  const before = await env.DB.prepare('SELECT last_crawl_at FROM websites WHERE id = ?').bind(siteId).first<{ last_crawl_at: number }>();
  const CRAWLQ = { send: async () => { throw new Error('queue down'); } };
  const res = await worker.fetch(new Request(`http://localhost/api/sites/${siteId}/crawl`, { method: 'POST', headers: { cookie } }),
    { ...env, CRAWLQ } as never, createExecutionContext());
  expect(res.status).toBe(500);
  const after = await env.DB.prepare('SELECT last_crawl_at FROM websites WHERE id = ?').bind(siteId).first<{ last_crawl_at: number }>();
  expect(after!.last_crawl_at).toBe(before!.last_crawl_at);
});

test('checkUrl stops reading a redirect body after 64 KB', async () => {
  const real = globalThis.fetch;
  let pulled = 0;
  const endless = () => new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(16 * 1024)); } });
  globalThis.fetch = (async (input: RequestInfo | URL) => String(input).endsWith('/to')
    ? new Response('ok')
    : new Response(endless(), { status: 302, headers: { location: '/to' } })) as typeof fetch;
  try {
    const r = await checkUrl('https://huge-redirect.test/from', { ignore_status_codes: '[]' });
    expect(r).toMatchObject({ status: 200, ok: true });
    expect(pulled).toBeLessThan(10);
  } finally { globalThis.fetch = real; }
});
