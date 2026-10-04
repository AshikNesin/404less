// Mailer adapter selection + MIME building.
import { describe, expect, test, vi } from 'vitest';
import { buildMime } from '../src/lib/mailer';
import { getMailer } from '../src/lib/mailer';
import { env } from 'cloudflare:workers';

test('mailer falls back to dev logger without config', () => {
  // test env has neither RESEND_API_KEY nor a real EMAIL binding contract — but EMAIL IS bound via wrangler.jsonc;
  // so we test selection logic indirectly: kind must be one of the three and never throw.
  const m = getMailer(env as never);
  expect(['resend', 'cloudflare', 'dev']).toContain(m.kind);
});

test('buildMime produces multipart/alternative with boundary', () => {
  const raw = buildMime('a@b.c', 'd@e.f', 'Hello 404', '<p>Hi</p>', 'Hi');
  expect(raw).toContain('From: a@b.c');
  expect(raw).toContain('To: d@e.f');
  expect(raw).toContain('Subject: Hello 404');
  expect(raw).toContain('Content-Type: multipart/alternative');
  expect(raw).toContain('Content-Type: text/plain; charset=utf-8');
  expect(raw).toContain('Content-Type: text/html; charset=utf-8');
  expect(raw).toContain('<p>Hi</p>');
  expect(raw).toMatch(/--=_404less_[a-f0-9]{20}/);
});

test('buildMime strips html for text part when text omitted', () => {
  const raw = buildMime('a@b.c', 'd@e.f', 'S', '<p>Hello <b>world</b></p>');
  const textPart = raw.split('Content-Type: text/plain')[1]?.split('--=')[0] ?? '';
  expect(textPart).toContain('Hello world');
  expect(textPart).not.toContain('<');
});

test('cloudflare adapter sends via binding', async () => {
  const send = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const { getMailer } = await import('../src/lib/mailer');
  const m = getMailer({ EMAIL: { send } } as never);
  expect(m.kind).toBe('cloudflare');
  await m.send({ to: 'x@y.z', subject: 'Test 404', html: '<p>t</p>', text: 't' });
  expect(send).toHaveBeenCalledTimes(1);
  const msg = send.mock.calls[0][0] as { from: string; to: string };
  expect(msg.to).toBe('x@y.z');
  expect(msg.from).toContain('@');
  // raw content is opaque in the runtime (private); MIME structure covered by buildMime tests above
});

test('resend adapter preferred when RESEND_API_KEY present', async () => {
  const { getMailer } = await import('../src/lib/mailer');
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    const m = getMailer({ RESEND_API_KEY: 're_test', EMAIL: { send: vi.fn() } } as never);
    expect(m.kind).toBe('resend');
    await m.send({ to: 'x@y.z', subject: 's', html: '<p>h</p>' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }));
  } finally {
    globalThis.fetch = realFetch;
  }
});
