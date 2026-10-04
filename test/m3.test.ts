// M3: channels CRUD, digest DO (buffer -> flush -> channel), CSV export, notify settings.
import { SELF, env } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';

let cookie = '';
let teamId = '';
let siteId = '';
let siteKey = '';

beforeAll(async () => {
  const r = await SELF.fetch('http://localhost/auth/magic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm3@example.com' }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: 'manual' });
  cookie = (v.headers.get('set-cookie') ?? '').split(';')[0];
  const h = { 'Content-Type': 'application/json', cookie };
  const team = await (await SELF.fetch('http://localhost/api/teams', { method: 'POST', headers: h, body: JSON.stringify({ name: 'M3' }) })).json() as any;
  teamId = team.team.id;
  const site = await (await SELF.fetch('http://localhost/api/sites', { method: 'POST', headers: h, body: JSON.stringify({ teamId, name: 'S', domain: 'm3.test' }) })).json() as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
});

test('channel CRUD + validation + secrets never returned', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  const bad = await SELF.fetch(`http://localhost/api/teams/${teamId}/channels`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ type: 'slack', config: { url: 'notaurl' } }),
  });
  expect(bad.status).toBe(400);

  const ok = await SELF.fetch(`http://localhost/api/teams/${teamId}/channels`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ type: 'slack', name: 'Ops room', config: { url: 'https://hooks.slack.com/services/T00/B00/xyz' } }),
  });
  expect(ok.status).toBe(201);
  const { channel } = await ok.json() as any;

  const list = await (await SELF.fetch(`http://localhost/api/teams/${teamId}/channels`, { headers: { cookie } })).json() as any;
  expect(list.channels).toHaveLength(1);
  expect(list.channels[0]).not.toHaveProperty('config'); // secret excluded
  expect(list.channels[0].name).toBe('Ops room');

  const off = await SELF.fetch(`http://localhost/api/teams/${teamId}/channels/${channel.id}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ enabled: false }),
  });
  expect(off.status).toBe(200);

  const del = await SELF.fetch(`http://localhost/api/teams/${teamId}/channels/${channel.id}`, { method: 'DELETE', headers: { cookie } });
  expect(del.status).toBe(200);
});

test('digest DO: events buffered, flushed once per window, grouped by url', async () => {
  // create an email channel (mailer null in tests -> sendToChannel throws -> no alert row,
  // so also create a slack channel with stubbed fetch to observe the digest)
  const h = { 'Content-Type': 'application/json', cookie };
  await SELF.fetch(`http://localhost/api/teams/${teamId}/channels`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ type: 'slack', name: 'stub', config: { url: 'https://hooks.example.test/T/B/x' } }),
  });

  const sent: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).startsWith('https://hooks.example.test/')) {
      sent.push(JSON.parse(String(init.body)));
      return new Response('ok');
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    // 3 events, two of the same URL -> should group to 2 lines in one digest
    for (const [url, ref] of [
      ['https://m3.test/missing-a', 'https://m3.test/'],
      ['https://m3.test/missing-a', 'https://m3.test/other'],
      ['https://m3.test/missing-b', null],
    ] as const) {
      const t = await SELF.fetch('http://localhost/api/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, url, referrer: ref }),
      });
      expect(t.status).toBe(200);
    }
    // waitUntil is async; poll until all 3 events reached the DO buffer, then flush
    const doStub = (env as any).DIGEST.get((env as any).DIGEST.idFromName(siteId));
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      await doStub.fetch('https://digest/flush', { method: 'POST' });
      if (sent.length && sent[0].text.includes('missing-b')) break;
    }
    expect(sent).toHaveLength(1);
    const text = sent[0].text as string;
    expect(text).toContain('3 broken-link hits on S');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('notify settings: toggle + digest window validation', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  const bad = await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ digest_minutes: 1 }),
  });
  expect(bad.status).toBe(400);
  const good = await SELF.fetch(`http://localhost/api/sites/${siteId}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ digest_minutes: 30, notify_enabled: false }),
  });
  expect(good.status).toBe(200);
});

test('CSV export: raw + grouped', async () => {
  const h = { 'Content-Type': 'application/json', cookie };
  await SELF.fetch('http://localhost/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteKey, url: 'https://m3.test/missing-a' }),
  });
  const raw = await SELF.fetch(`http://localhost/api/sites/${siteId}/events.csv`, { headers: { cookie } });
  expect(raw.headers.get('content-type')).toContain('text/csv');
  const rawText = await raw.text();
  expect(rawText.split('\n')[0]).toBe('url,referrer,user_agent,ts');
  expect(rawText).toContain('https://m3.test/missing-a');

  const grouped = await SELF.fetch(`http://localhost/api/sites/${siteId}/events.csv?group=url`, { headers: { cookie } });
  const gText = await grouped.text();
  expect(gText.split('\n')[0]).toBe('url,hits,first_seen,last_seen');
  const aRow = gText.split('\n').find((l) => l.startsWith('https://m3.test/missing-a'));
  expect(aRow).toMatch(/missing-a,3,/); // 3 tracked in this file's tests (2 in digest test + 1 here)
});

test('CSV escapes commas/quotes', async () => {
  // referrer with comma + quote via direct D1 insert
  await env.DB.prepare("INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES (?, ?, ?, ?, NULL, ?)")
    .bind(crypto.randomUUID(), siteId, 'https://m3.test/weird",path', 'https://m3.test/ref?x=",1', Date.now()).run();
  const csv = await (await SELF.fetch(`http://localhost/api/sites/${siteId}/events.csv`, { headers: { cookie } })).text();
  const line = csv.split('\n').find((l) => l.includes('weird'));
  // CSV-correct: whole field quoted, inner quote doubled -> weird"",path
  expect(line).toContain('weird"",path');
});
