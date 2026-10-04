// Authenticated API-key management (per team).
import { Hono } from 'hono';
import { createKey, deleteKey, listKeys } from '../server/features/keys/service';
import type { Env } from '../types';

export const keys = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

async function memberTeam(env: Env, teamId: string | undefined, userId: string): Promise<boolean> {
  if (!teamId) return false;
  const row = await env.DB.prepare('SELECT 1 AS ok FROM team_members WHERE team_id = ? AND user_id = ?')
    .bind(teamId, userId).first();
  return !!row;
}

keys.get('/teams/:teamId/keys', async (c) => {
  if (!(await memberTeam(c.env, c.req.param('teamId'), c.get('userId')))) return c.json({ error: 'not found' }, 404);
  return c.json({ keys: await listKeys(c.env, c.req.param('teamId')) });
});

keys.post('/teams/:teamId/keys', async (c) => {
  const teamId = c.req.param('teamId');
  if (!(await memberTeam(c.env, teamId, c.get('userId')))) return c.json({ error: 'not found' }, 404);
  // hard cap per team to protect self-hosters' D1
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE team_id = ?').bind(teamId)
    .first<{ n: number }>();
  if (count!.n >= 20) return c.json({ error: 'key limit reached (max 20)' }, 402);
  const created = await createKey(c.env, teamId);
  return c.json({ key: { id: created.id, prefix: created.prefix }, secret: created.key }, 201); // shown once
});

keys.delete('/teams/:teamId/keys/:id', async (c) => {
  const teamId = c.req.param('teamId');
  if (!(await memberTeam(c.env, teamId, c.get('userId')))) return c.json({ error: 'not found' }, 404);
  await deleteKey(c.env, teamId, c.req.param('id'));
  return c.json({ ok: true });
});
