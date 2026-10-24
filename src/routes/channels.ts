// Team notification channels (Slack / Pushover / email) + alert history + CSV export.
import { Hono } from 'hono';
import { newId, now } from '../lib/auth';
import { validateChannelConfig, type ChannelType } from '../lib/notify';
import type { Env } from '../types';

export const channels = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

async function teamRole(env: Env, teamId: string | undefined, userId: string): Promise<'owner' | 'admin' | 'viewer' | null> {
  if (!teamId) return null;
  const row = await env.DB.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?')
    .bind(teamId, userId).first<{ role: 'owner' | 'admin' | 'viewer' }>();
  return row?.role ?? null;
}

// list channels for a team
channels.get('/teams/:teamId/channels', async (c) => {
  const role = await teamRole(c.env, c.req.param('teamId'), c.get('userId'));
  if (!role) return c.json({ error: 'not found' }, 404);
  const rows = await c.env.DB.prepare(
    'SELECT id, type, name, enabled, created_at FROM alert_channels WHERE team_id = ? ORDER BY created_at',
  ).bind(c.req.param('teamId')).all();
  // never return secrets
  return c.json({ channels: rows.results });
});

// create channel (config stored once, never returned)
channels.post('/teams/:teamId/channels', async (c) => {
  const teamId = c.req.param('teamId');
  const role = await teamRole(c.env, teamId, c.get('userId'));
  if (!role) return c.json({ error: 'not found' }, 404);
  if (role === 'viewer') return c.json({ error: 'viewers cannot manage channels' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const type = body?.type as ChannelType;
  if (!['slack', 'pushover', 'email'].includes(type)) return c.json({ error: 'invalid type' }, 400);
  const config = validateChannelConfig(type, body?.config);
  if (!config) return c.json({ error: 'invalid config for ' + type }, 400);
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : type;

  const id = newId();
  await c.env.DB.prepare(
    'INSERT INTO alert_channels (id, team_id, type, name, config, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  ).bind(id, teamId, type, name, JSON.stringify(config), now()).run();
  return c.json({ channel: { id, type, name, enabled: 1 } }, 201);
});

// enable/disable or delete
channels.patch('/teams/:teamId/channels/:id', async (c) => {
  const teamId = c.req.param('teamId');
  const role = await teamRole(c.env, teamId, c.get('userId'));
  if (!role) return c.json({ error: 'not found' }, 404);
  if (role === 'viewer') return c.json({ error: 'viewers cannot manage channels' }, 403);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body?.enabled === 'boolean') {
    await c.env.DB.prepare('UPDATE alert_channels SET enabled = ? WHERE id = ? AND team_id = ?')
      .bind(body.enabled ? 1 : 0, c.req.param('id'), teamId).run();
  }
  return c.json({ ok: true });
});

channels.delete('/teams/:teamId/channels/:id', async (c) => {
  const teamId = c.req.param('teamId');
  const role = await teamRole(c.env, teamId, c.get('userId'));
  if (!role) return c.json({ error: 'not found' }, 404);
  if (role === 'viewer') return c.json({ error: 'viewers cannot manage channels' }, 403);
  // its alert history goes too (alerts.channel_id references it, and history is shown per channel)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM alerts WHERE channel_id IN (SELECT id FROM alert_channels WHERE id = ? AND team_id = ?)')
      .bind(c.req.param('id'), teamId),
    c.env.DB.prepare('DELETE FROM alert_channels WHERE id = ? AND team_id = ?').bind(c.req.param('id'), teamId),
  ]);
  return c.json({ ok: true });
});

// recent alert history for a site
channels.get('/sites/:id/alerts', async (c) => {
  const site = await c.env.DB.prepare(
    `SELECT w.id FROM websites w JOIN team_members tm ON tm.team_id = w.team_id WHERE w.id = ? AND tm.user_id = ?`,
  ).bind(c.req.param('id'), c.get('userId')).first();
  if (!site) return c.json({ error: 'not found' }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.summary, a.sent_at, ch.type AS channel_type, ch.name AS channel_name
     FROM alerts a JOIN alert_channels ch ON ch.id = a.channel_id
     WHERE a.website_id = ? ORDER BY a.sent_at DESC LIMIT 50`,
  ).bind(c.req.param('id')).all();
  return c.json({ alerts: rows.results });
});

// test-fire a digest for a channel (validates wiring without waiting for a real 404)
channels.post('/teams/:teamId/channels/:id/test', async (c) => {
  const teamId = c.req.param('teamId');
  const role = await teamRole(c.env, teamId, c.get('userId'));
  if (!role) return c.json({ error: 'not found' }, 404);
  const ch = await c.env.DB.prepare('SELECT id, type, config FROM alert_channels WHERE id = ? AND team_id = ?')
    .bind(c.req.param('id'), teamId).first<{ id: string; type: ChannelType; config: string }>();
  if (!ch) return c.json({ error: 'not found' }, 404);
  const { sendToChannel } = await import('../lib/notify');
  const { getMailer } = await import('../lib/mailer');
  const digest = {
    title: '404less: test notification',
    text: 'If you can read this, the channel is wired correctly.',
    html: '<b>404less test</b> — channel is wired correctly.',
  };
  try {
    await sendToChannel(ch.type, JSON.parse(ch.config), digest, getMailer(c.env));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
});
