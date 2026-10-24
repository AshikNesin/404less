// Real page titles: read from the pages (crawler + fetch-titles job), shown by suggestions;
// sitemap imports store none and never overwrite one.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import { pageTitle } from '../src/server/features/crawl/html';
import { startTitleJobs } from '../src/server/features/crawl/service';

test('pageTitle: <title>, og:title fallback, whitespace collapse, absent', () => {
  expect(pageTitle('<html><head><title>  Real   Title </title></head></html>')).toBe('Real Title');
  expect(pageTitle('<meta property="og:title" content="OG Title">')).toBe('OG Title');
  expect(pageTitle('<meta content="OG reversed" property="og:title">')).toBe('OG reversed');
  expect(pageTitle('<title>T — Site Suffix Long Enough To Matter</title>')).toContain('T — Site');
  expect(pageTitle('<p>no title here</p>')).toBeNull();
});

test('pageTitle decodes numeric and named entities once', () => {
  expect(pageTitle('<title>Hello world! &#8211; Ashik&#8217;s Blog</title>')).toBe('Hello world! – Ashik’s Blog');
  expect(pageTitle('<title>Docs &mdash; Q&amp;A &#x2014; &copy;</title>')).toBe('Docs — Q&A — ©');
  expect(pageTitle('<title>&amp;lt;tag&amp;gt; &bogus; &constructor;</title>')).toBe('&lt;tag&gt; &bogus; &constructor;');
  expect(pageTitle('<title>R&AMP;D &COPY;</title>')).toBe('R&D ©');
});

let cookie = ''; let siteId = ''; let siteKey = ''; let teamId = '';
beforeAll(async () => {
  const r = await SELF.fetch('http://localhost/auth/magic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'titles@example.com' }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: 'manual' });
  cookie = (v.headers.get('set-cookie') ?? '').split(';')[0];
  const h = { 'Content-Type': 'application/json', cookie };
  const team = await (await SELF.fetch('http://localhost/api/teams', { method: 'POST', headers: h, body: JSON.stringify({ name: 'T' }) })).json() as any;
  teamId = team.team.id;
  const site = await (await SELF.fetch('http://localhost/api/sites', { method: 'POST', headers: h, body: JSON.stringify({ teamId, name: 'S', domain: 'titles.test' }) })).json() as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
});

test('fetch-page persists real <title> to known_urls; shows in suggestions', async () => {
  await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ crawl_enabled: true, crawl_max_pages: 5 }),
  });
  const PAGE = '<html><head><title>Cloudflare Claude Setup Guide</title></head><body><a href="/x">X</a></body></html>';
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    if (String(input) === 'https://titles.test/til/cloudflare-claude') return new Response(PAGE, { status: 200 });
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const worker = (await import('../src/index')).default;
    const { createMessageBatch, createExecutionContext, waitOnExecutionContext } = await import('cloudflare:test');
    const batch = createMessageBatch('q', [
      { id: 't1', timestamp: new Date(0), attempts: 1, body: { kind: 'fetch-page', siteId, url: 'https://titles.test/til/cloudflare-claude', depth: 0 } } as never,
    ]);
    const ctx = createExecutionContext();
    const { queue } = await import('../src/cron');
    await queue(batch, env as never, ctx);
    await waitOnExecutionContext(ctx);

    const row = await env.DB.prepare("SELECT title FROM known_urls WHERE website_id = ? AND url = ?")
      .bind(siteId, 'https://titles.test/til/cloudflare-claude').first<{ title: string | null }>();
    expect(row!.title).toBe('Cloudflare Claude Setup Guide');
  } finally {
    globalThis.fetch = real;
  }
});

async function runQueue(body: unknown) {
  const { createMessageBatch, createExecutionContext, waitOnExecutionContext } = await import('cloudflare:test');
  const { queue } = await import('../src/cron');
  const batch = createMessageBatch('q', [{ id: crypto.randomUUID(), timestamp: new Date(0), attempts: 1, body } as never]);
  const ctx = createExecutionContext();
  await queue(batch, env as never, ctx);
  await waitOnExecutionContext(ctx);
}

function captureQueue() {
  const sent: any[] = [];
  const q = (env as any).CRAWLQ;
  const real = { send: q.send, sendBatch: q.sendBatch };
  q.send = async (body: any) => { sent.push(body); };
  q.sendBatch = async (msgs: any[]) => { sent.push(...msgs.map((m) => m.body)); };
  return { sent, restore: () => Object.assign(q, real) };
}

function stubPages(page: (url: string) => Response) {
  const real = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async (input: any) => { fetched++; return page(String(input)); }) as typeof fetch;
  return { fetched: () => fetched, restore: () => { globalThis.fetch = real; } };
}

const HTML = { 'content-type': 'text/html; charset=utf-8' };

async function addKnown(urls: string[]) {
  for (const u of urls) {
    await env.DB.prepare("INSERT INTO known_urls (id, website_id, url, title, source, added_at) VALUES (?, ?, ?, NULL, 'sitemap', 1)")
      .bind(crypto.randomUUID(), siteId, u).run();
  }
}

async function addBrokenLink(id: string, url: string) {
  await env.DB.prepare(
    "INSERT INTO broken_links (id, website_id, url, status, source, hits, first_seen, last_seen) VALUES (?, ?, ?, 'open', 'visitor', 1, 1, 1)",
  ).bind(id, siteId, url).run();
}

async function knownRow(url: string) {
  return env.DB.prepare('SELECT title, title_checked_at FROM known_urls WHERE website_id = ? AND url = ?')
    .bind(siteId, url).first<{ title: string | null; title_checked_at: number | null }>();
}

test('fetch-titles: stores real titles, skips non-HTML and errors, updates stored suggestions', async () => {
  const urls = ['https://titles.test/docs/install', 'https://titles.test/guide.pdf', 'https://titles.test/gone'];
  await addKnown(urls);
  await addBrokenLink('bl1', 'https://titles.test/docs/instal');
  const pages = stubPages((u) => {
    if (u === urls[0]) return new Response('<html><head><title>Install &#8211; Docs</title></head><body>…</body></html>', { headers: HTML });
    if (u === urls[1]) return new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } });
    return new Response('<title>Not found</title>', { status: 404, headers: HTML });
  });
  const q = captureQueue();
  try {
    const [first] = await startTitleJobs(env as never, [siteId]);
    await runQueue(first);
  } finally {
    pages.restore();
    q.restore();
  }

  expect(await knownRow(urls[0])).toMatchObject({ title: 'Install – Docs' });
  for (const u of urls) expect((await knownRow(u))!.title_checked_at).toBeGreaterThan(0); // each page tried once
  expect((await knownRow(urls[1]))!.title).toBeNull();
  expect((await knownRow(urls[2]))!.title).toBeNull();
  const link = await env.DB.prepare("SELECT suggested_url, suggested_title FROM broken_links WHERE id = 'bl1'").first();
  expect(link).toEqual({ suggested_url: urls[0], suggested_title: 'Install – Docs' }); // refreshed when the job finished
  expect(q.sent).toEqual([]); // backlog drained, no follow-up

  const r = await SELF.fetch(`http://localhost/api/suggestions?site=${siteKey}&url=https://titles.test/docs/instal`);
  const { suggestions } = await r.json() as any;
  expect(suggestions[0]).toMatchObject({ url: urls[0], title: 'Install – Docs' });
});

test('fetch-titles: works through a backlog a few pages per message; pages count as tried only once fetched', async () => {
  await addKnown([0, 1, 2, 3, 4, 5, 6].map((i) => `https://titles.test/p/${i}`));
  let checkedDuringFetch: number | null | undefined;
  const pages = stubPages((u) => new Response(`<title>Page ${u.split('/').pop()}</title>`, { headers: HTML }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    if (String(input).endsWith('/p/0')) checkedDuringFetch = (await knownRow('https://titles.test/p/0'))!.title_checked_at;
    return realFetch(input);
  }) as typeof fetch;
  const q = captureQueue();
  try {
    const [first] = await startTitleJobs(env as never, [siteId]);
    await runQueue(first);
    expect(pages.fetched()).toBe(5);
    expect(checkedDuringFetch).toBeNull(); // the dashboard keeps showing "fetching title…" until it lands
    expect(q.sent).toEqual([first]); // more waiting -> next message, same job
    await runQueue(q.sent.pop());
    expect(pages.fetched()).toBe(7);
    expect(q.sent).toEqual([]);
  } finally {
    pages.restore();
    q.restore();
  }
  expect((await knownRow('https://titles.test/p/6'))!.title).toBe('Page 6');
});

test('fetch-titles: a newer job takes over, so a site never has two fetching at once', async () => {
  await addKnown(['https://titles.test/q/a', 'https://titles.test/q/b']);
  const pages = stubPages(() => new Response('<title>Q</title>', { headers: HTML }));
  const q = captureQueue();
  try {
    const [older] = await startTitleJobs(env as never, [siteId]);
    const [newer] = await startTitleJobs(env as never, [siteId]);
    await runQueue(older);
    expect(pages.fetched()).toBe(0);
    await runQueue(newer);
    expect(pages.fetched()).toBe(2);
  } finally {
    pages.restore();
    q.restore();
  }
});

test('fetch-titles: a title three pages share stays out of stored suggestions', async () => {
  await addKnown(['https://titles.test/app/settings', 'https://titles.test/app/billing', 'https://titles.test/app/team']);
  await addBrokenLink('bl2', 'https://titles.test/app/setting');
  const pages = stubPages(() => new Response('<title>Acme App</title>', { headers: HTML }));
  const q = captureQueue();
  try {
    const [first] = await startTitleJobs(env as never, [siteId]);
    await runQueue(first);
  } finally {
    pages.restore();
    q.restore();
  }
  expect((await knownRow('https://titles.test/app/settings'))!.title).toBe('Acme App'); // stored as fetched
  const link = await env.DB.prepare("SELECT suggested_url, suggested_title FROM broken_links WHERE id = 'bl2'").first();
  expect(link).toEqual({ suggested_url: 'https://titles.test/app/settings', suggested_title: null });
});

test('sitemap import stores no guessed titles, keeps crawled ones, and starts the title job', async () => {
  const SITEMAP = `<urlset>
    <url><loc>https://titles.test/blog/fresh-post</loc></url>
    <url><loc>https://titles.test/til/cloudflare-claude</loc></url>
  </urlset>`;
  const pages = stubPages((u) => u === 'https://titles.test/sitemap.xml' ? new Response(SITEMAP) : new Response('nf', { status: 404 }));
  const q = captureQueue();
  try {
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{}',
    });
    expect(await r.json()).toMatchObject({ imported: 2, inserted: 1 });
    expect(q.sent).toContainEqual(expect.objectContaining({ kind: 'fetch-titles', siteId }));
  } finally {
    pages.restore();
    q.restore();
  }
  expect(await knownRow('https://titles.test/blog/fresh-post')).toEqual({ title: null, title_checked_at: null });
  expect((await knownRow('https://titles.test/til/cloudflare-claude'))!.title).toBe('Cloudflare Claude Setup Guide'); // crawled title survives
});
