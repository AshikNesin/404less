// Real page titles: read from the pages (crawler + fetch-titles job), shown by suggestions;
// sitemap imports store none and never overwrite one.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import { pageTitle } from '../src/server/features/crawl/html';

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
  expect(pageTitle('<title>&amp;lt;tag&amp;gt; &bogus;</title>')).toBe('&lt;tag&gt; &bogus;');
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

test('sitemap import does not overwrite crawled real title', async () => {
  // simulate a later sitemap import of the same URL
  await env.DB.prepare(
    `INSERT INTO known_urls (id, website_id, url, title, source, added_at)
     VALUES ('sm1', ?, 'https://titles.test/til/cloudflare-claude', NULL, 'sitemap', 1)
     ON CONFLICT(website_id, url) DO NOTHING`,
  ).bind(siteId).run();
  const row = await env.DB.prepare("SELECT title FROM known_urls WHERE website_id = ? AND url = ?")
    .bind(siteId, 'https://titles.test/til/cloudflare-claude').first<{ title: string | null }>();
  expect(row!.title).toBe('Cloudflare Claude Setup Guide'); // real title survived
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

async function knownRow(url: string) {
  return env.DB.prepare('SELECT title, title_checked_at FROM known_urls WHERE website_id = ? AND url = ?')
    .bind(siteId, url).first<{ title: string | null; title_checked_at: number | null }>();
}

test('fetch-titles: stores real titles, skips non-HTML and errors, updates stored suggestions', async () => {
  const urls = ['https://titles.test/docs/install', 'https://titles.test/guide.pdf', 'https://titles.test/gone'];
  for (const u of urls) {
    await env.DB.prepare("INSERT INTO known_urls (id, website_id, url, title, source, added_at) VALUES (?, ?, ?, NULL, 'sitemap', 1)")
      .bind(crypto.randomUUID(), siteId, u).run();
  }
  await env.DB.prepare(
    "INSERT INTO broken_links (id, website_id, url, status, source, hits, first_seen, last_seen, suggested_url) VALUES ('bl1', ?, 'https://titles.test/docs/instal', 'open', 'visitor', 1, 1, 1, ?)",
  ).bind(siteId, urls[0]).run();

  const html = { 'content-type': 'text/html; charset=utf-8' };
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const u = String(input);
    if (u === urls[0]) return new Response('<html><head><title>Install &#8211; Docs</title></head><body>…</body></html>', { headers: html });
    if (u === urls[1]) return new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } });
    return new Response('<title>Not found</title>', { status: 404, headers: html });
  }) as typeof fetch;
  const q = captureQueue();
  try {
    await runQueue({ kind: 'fetch-titles', siteId });
  } finally {
    globalThis.fetch = real;
    q.restore();
  }

  expect(await knownRow(urls[0])).toMatchObject({ title: 'Install – Docs' });
  for (const u of urls) expect((await knownRow(u))!.title_checked_at).toBeGreaterThan(0); // each page tried once
  expect((await knownRow(urls[1]))!.title).toBeNull();
  expect((await knownRow(urls[2]))!.title).toBeNull();
  const link = await env.DB.prepare("SELECT suggested_title FROM broken_links WHERE id = 'bl1'").first<{ suggested_title: string }>();
  expect(link!.suggested_title).toBe('Install – Docs');
  expect(q.sent).toEqual([]); // backlog drained, no follow-up

  const r = await SELF.fetch(`http://localhost/api/suggestions?site=${siteKey}&url=https://titles.test/docs/instal`);
  const { suggestions } = await r.json() as any;
  expect(suggestions[0]).toMatchObject({ url: urls[0], title: 'Install – Docs' });
});

test('fetch-titles: works through a backlog a few pages per message', async () => {
  for (let i = 0; i < 7; i++) {
    await env.DB.prepare("INSERT INTO known_urls (id, website_id, url, title, source, added_at) VALUES (?, ?, ?, NULL, 'sitemap', 1)")
      .bind(crypto.randomUUID(), siteId, `https://titles.test/p/${i}`).run();
  }
  const real = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async (input: any) => {
    fetched++;
    return new Response(`<title>Page ${String(input).split('/').pop()}</title>`, { headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  const q = captureQueue();
  try {
    await runQueue({ kind: 'fetch-titles', siteId });
    expect(fetched).toBe(5);
    expect(q.sent).toEqual([{ kind: 'fetch-titles', siteId }]); // more waiting -> next message
    await runQueue(q.sent.pop());
    expect(fetched).toBe(7);
    expect(q.sent).toEqual([]);
  } finally {
    globalThis.fetch = real;
    q.restore();
  }
  expect((await knownRow('https://titles.test/p/6'))!.title).toBe('Page 6');
});

test('sitemap import stores no guessed titles and starts the title job', async () => {
  const SITEMAP = `<urlset><url><loc>https://titles.test/blog/fresh-post</loc></url></urlset>`;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => String(input) === 'https://titles.test/sitemap.xml'
    ? new Response(SITEMAP) : new Response('nf', { status: 404 })) as typeof fetch;
  const q = captureQueue();
  try {
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{}',
    });
    expect(await r.json()).toMatchObject({ imported: 1, inserted: 1 });
    expect(q.sent).toContainEqual({ kind: 'fetch-titles', siteId });
  } finally {
    globalThis.fetch = real;
    q.restore();
  }
  expect(await knownRow('https://titles.test/blog/fresh-post')).toEqual({ title: null, title_checked_at: null });
});
