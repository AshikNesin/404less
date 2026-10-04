// Real page titles: extracted by crawler, shown by suggestions; sitemap guesses never overwrite.
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

test('sitemap import (slug guess) does not overwrite crawled real title', async () => {
  // simulate a later sitemap import attempting the same URL with a slug-guess title
  await env.DB.prepare(
    `INSERT INTO known_urls (id, website_id, url, title, source, added_at)
     VALUES ('sm1', ?, 'https://titles.test/til/cloudflare-claude', 'Til Cloudflare Claude', 'sitemap', 1)
     ON CONFLICT(website_id, url) DO NOTHING`,
  ).bind(siteId).run();
  const row = await env.DB.prepare("SELECT title FROM known_urls WHERE website_id = ? AND url = ?")
    .bind(siteId, 'https://titles.test/til/cloudflare-claude').first<{ title: string | null }>();
  expect(row!.title).toBe('Cloudflare Claude Setup Guide'); // real title survived
});
