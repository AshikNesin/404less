// Auth: magic-link request + verification, session cookie, logout.
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { getMailer } from '../lib/mailer';
import { newId, now, SESSION_COOKIE, signSession, verifySession } from '../lib/auth';
import type { Env } from '../types';

export const auth = new Hono<{ Bindings: Env }>();

auth.post('/magic', async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: null }));
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'invalid email' }, 400);

  // Upsert user
  const userId = newId();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(userId, email.toLowerCase(), now()).run();
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: string }>();

  // Create magic token (15 min TTL)
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare('INSERT INTO magic_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user!.id, now() + 15 * 60 * 1000).run();

  const link = `${new URL(c.req.url).origin}/auth/verify?token=${token}`;
  const mailer = getMailer(c.env);
  if (mailer) {
    await mailer.send({
      to: email,
      subject: 'Your 404less sign-in link',
      html: `<p>Click to sign in to 404less:</p><p><a href="${link}">${link}</a></p><p>The link expires in 15 minutes.</p>`,
      text: `Sign in: ${link}\nExpires in 15 minutes.`,
    });
    return c.json({ ok: true, emailed: true });
  }
  // Dev mode (no RESEND_API_KEY): return the link so you can test locally.
  console.log('[404less] magic link for', email, ':', link);
  return c.json({ ok: true, emailed: false, devLink: link });
});

auth.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'missing token' }, 400);
  const row = await c.env.DB.prepare(
    'SELECT user_id, expires_at FROM magic_tokens WHERE token = ?',
  ).bind(token).first<{ user_id: string; expires_at: number }>();
  if (!row || row.expires_at < now()) return c.json({ error: 'invalid or expired' }, 400);

  await c.env.DB.prepare('DELETE FROM magic_tokens WHERE token = ?').bind(token).run();

  const cookie = await signSession(c.env, row.user_id);
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  );
  return c.redirect('/app');
});

auth.post('/logout', async (c) => {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

export async function requireUser(c: { env: Env; req: { header(name: string): string | undefined } }, getCookieFn = getCookie): Promise<string | null> {
  const cookie = getCookieFn(c as never, SESSION_COOKIE);
  const userId = await verifySession(c.env, cookie);
  return userId;
}
