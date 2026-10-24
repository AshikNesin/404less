// Auth: magic-link request + verification, session cookie, logout.
import { Hono } from 'hono';
import { getMailer } from '../lib/mailer';
import { newId, now, SESSION_COOKIE, signSession } from '../lib/auth';
import type { Env } from '../types';

export const auth = new Hono<{ Bindings: Env }>();

auth.post('/magic', async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: null }));
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return c.json({ error: 'invalid email' }, 400);
  }
  const normalized = email.toLowerCase();

  // Upsert user
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(newId(), normalized, now()).run();
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalized).first<{ id: string }>();

  // Create magic token (15 min TTL)
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare('INSERT INTO magic_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user!.id, now() + 15 * 60 * 1000).run();

  const link = `${new URL(c.req.url).origin}/auth/verify?token=${token}`;

  const mailer = getMailer(c.env);
  if (mailer) {
    await mailer.send({
      to: normalized,
      subject: 'Your 404less sign-in link',
      html: `<div style="font-family:system-ui,sans-serif;color:#1b1e27;max-width:480px">
        <p style="font-size:15px">Click the button to sign in to 404less. The link expires in 15 minutes.</p>
        <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Sign in to 404less</a></p>
        <p style="font-size:12px;color:#6b7280">Or paste this link into your browser:<br>${link}</p>
        <p style="font-size:12px;color:#6b7280">If you didn’t request this, you can ignore this email.</p></div>`,
      text: `Sign in to 404less: ${link}\nThe link expires in 15 minutes.`,
    });
    return c.json({ ok: true, emailed: true });
  }
  // Dev mode (no RESEND_API_KEY): return the link so you can test locally.
  console.log('[404less] magic link for', normalized, ':', link);
  return c.json({ ok: true, emailed: false, devLink: link });
});

auth.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'missing token' }, 400);
  const row = await c.env.DB.prepare(
    'SELECT user_id, expires_at FROM magic_tokens WHERE token = ?',
  ).bind(token).first<{ user_id: string; expires_at: number }>();
  if (!row || row.expires_at < now()) return c.redirect('/?error=expired');

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM magic_tokens WHERE token = ?').bind(token),
    c.env.DB.prepare('DELETE FROM magic_tokens WHERE expires_at < ?').bind(now()),
  ]);
  await ensureTeam(c.env, row.user_id);

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

/** Every user gets a personal team on first sign-in, so "add a site" never needs a team step. */
async function ensureTeam(env: Env, userId: string): Promise<void> {
  const member = await env.DB.prepare('SELECT 1 AS ok FROM team_members WHERE user_id = ? LIMIT 1').bind(userId).first();
  if (member) return;
  const teamId = newId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO teams (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)').bind(teamId, 'Personal', userId, now()),
    env.DB.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').bind(teamId, userId, 'owner'),
  ]);
}
