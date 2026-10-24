// M2 integration: sitemap import (outbound fetch mocked), exclusions, suggestions.
import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, expect, test } from 'vitest';

let cookie = '';
let siteId = '';
let siteKey = '';

beforeAll(async () => {
  const r = await SELF.fetch('http://localhost/auth/magic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm2@example.com' }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: 'manual' });
  cookie = (v.headers.get('set-cookie') ?? '').split(';')[0];

  const h = { 'Content-Type': 'application/json', cookie };
  const team = await (await SELF.fetch('http://localhost/api/teams', { method: 'POST', headers: h, body: JSON.stringify({ name: 'M2' }) })).json() as any;
  const site = await (await SELF.fetch('http://localhost/api/sites', { method: 'POST', headers: h, body: JSON.stringify({ teamId: team.team.id, name: 'S', domain: 'import.test' }) })).json() as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;

  // Seed known URLs directly in D1 (unit-ish; the fetch path is covered below)
  const urls = [
    'https://import.test/blog/hello-world',
    'https://import.test/blog/hello-word-2',
    'https://import.test/about',
  ];
  await Promise.all(urls.map((u) =>
    env.DB.prepare("INSERT INTO known_urls (id, website_id, url, title, source, added_at) VALUES (?, ?, ?, NULL, 'sitemap', ?)")
      .bind(crypto.randomUUID(), siteId, u, Date.now()).run(),
  ));
});

test('suggestions endpoint ranks known urls', async () => {
  const r = await SELF.fetch(`http://localhost/api/suggestions?site=${siteKey}&url=https://import.test/blog/hello-word`);
  const { suggestions } = await r.json() as any;
  expect(suggestions.length).toBeGreaterThan(0);
  // hello-word-2 ranks above hello-world: token Jaccard is perfect (1.0) for the former
  expect(suggestions[0].url).toBe('https://import.test/blog/hello-word-2');
  expect(suggestions.map((s: any) => s.url)).toContain('https://import.test/blog/hello-world');
});

test('unknown site -> 404', async () => {
  const r = await SELF.fetch(`http://localhost/api/suggestions?site=zz&url=https://x/`);
  expect(r.status).toBe(404);
});

test('exclusions: PATCH then track respects them', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  const patch = await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ exclude_patterns: ['/wp-admin/'] }),
  });
  expect(patch.status).toBe(200);
  const body = await patch.json() as any;
  expect(body.site.exclude_patterns).toEqual(['/wp-admin/']);

  const tracked = await SELF.fetch('http://localhost/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteKey, url: 'https://import.test/wp-admin/settings' }),
  });
  expect(await tracked.json()).toEqual({ ok: true, ignored: true });

  const kept = await SELF.fetch('http://localhost/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteKey, url: 'https://import.test/blog/missing' }),
  });
  expect(await kept.json()).toEqual({ ok: true });

  const ev = await (await SELF.fetch(`http://localhost/api/sites/${siteId}/events`, { headers: { cookie } })).json() as any;
  expect(ev.events.map((e: any) => e.url)).toContain('https://import.test/blog/missing');
  expect(ev.events.map((e: any) => e.url)).not.toContain('https://import.test/wp-admin/settings');
});

test('PATCH validates status codes', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  const r = await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ ignore_status_codes: [404, 9999] }),
  });
  const body = await r.json() as any;
  // invalid entries rejected -> falls back to current value ([]), request still succeeds
  expect(body.site.ignore_status_codes).toEqual([]);
});

test('PATCH requires membership', async () => {
  const r = await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'hijack' }),
  });
  expect(r.status).toBe(401); // no cookie
});

test('import-sitemap validates and reports unusable sitemaps', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ sitemapUrl: 'https://import.test/sitemap.xml' }),
  });
  // outbound fetch fails in tests (no real site) -> 422 naming the sitemap that couldn't be read
  const body = await r.json() as any;
  expect(r.status).toBe(422);
  expect(body.error).toBe('could not fetch https://import.test/sitemap.xml');
});

test('known-urls listing', async () => {
  const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/known-urls`, { headers: { cookie } });
  const { knownUrls } = await r.json() as any;
  expect(knownUrls.length).toBeGreaterThanOrEqual(3);
  expect(knownUrls[0]).toHaveProperty('url');
});

// --- sitemap import with outbound fetch stubbed (same isolate as worker) ---
test('import-sitemap fetches, parses and stores known urls', async () => {
  const SITEMAP = `<?xml version="1.0"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://import.test/blog/hello-world</loc></url>
    <url><loc>https://import.test/blog/hello-word-2</loc></url>
    <url><loc>https://import.test/about</loc></url>
    <url><loc>https://evil.com/elsewhere</loc></url>
    <url><loc>https://import.test/search?x=1</loc></url>
  </urlset>`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u === 'https://import.test/sitemap.xml') return new Response(SITEMAP, { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const h = { 'Content-Type': 'application/json', cookie };
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: h, body: JSON.stringify({ sitemapUrl: 'https://import.test/sitemap.xml' }),
    });
    const body = await r.json() as any;
    expect(r.status).toBe(200);
    expect(body.imported).toBe(3); // cross-host + query-string urls excluded
    expect(body.inserted).toBe(0); // all three were already known

    const listed = await (await SELF.fetch(`http://localhost/api/sites/${siteId}/known-urls`, { headers: { cookie } })).json() as any;
    const urls = listed.knownUrls.map((k: any) => k.url);
    expect(urls).toContain('https://import.test/blog/hello-world');
    expect(urls).not.toContain('https://evil.com/elsewhere');

  } finally {
    globalThis.fetch = realFetch;
  }
});

test('import-sitemap follows sitemapindex one level', async () => {
  const INDEX = `<?xml version="1.0"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://import.test/posts.xml</loc></sitemap>
  </sitemapindex>`;
  const POSTS = `<?xml version="1.0"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://import.test/posts/alpha</loc></url>
  </urlset>`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u === 'https://import.test/sitemap.xml') return new Response(INDEX, { status: 200 });
    if (u === 'https://import.test/posts.xml') return new Response(POSTS, { status: 200 });
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const h = { 'Content-Type': 'application/json', cookie };
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: h, body: JSON.stringify({ sitemapUrl: 'https://import.test/sitemap.xml' }),
    });
    const body = await r.json() as any;
    expect(r.status).toBe(200);
    expect(body.imported).toBeGreaterThanOrEqual(1);
    const listed = await (await SELF.fetch(`http://localhost/api/sites/${siteId}/known-urls`, { headers: { cookie } })).json() as any;
    expect(listed.knownUrls.map((k: any) => k.url)).toContain('https://import.test/posts/alpha');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('import-sitemap: unreachable sitemap -> 422', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('nf', { status: 404 })) as typeof fetch;
  try {
    const h = { 'Content-Type': 'application/json', cookie };
    const r = await SELF.fetch(`http://localhost/api/sites/${siteId}/import-sitemap`, {
      method: 'POST', headers: h, body: JSON.stringify({ sitemapUrl: 'https://import.test/none.xml' }),
    });
    expect(r.status).toBe(422);
  } finally {
    globalThis.fetch = realFetch;
  }
});
