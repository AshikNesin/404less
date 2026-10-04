// Team API keys: bearer tokens for the REST API and MCP server.
// Keys are shown once at creation; only sha256 hashes are stored.
import type { Env } from '../../../types';
import { newApiToken, sha256Hex } from '../../../lib/auth';

export type ApiKeyRow = { id: string; team_id: string; key_hash: string; prefix: string; created_at: number };

export async function listKeys(env: Env, teamId: string) {
  const rows = await env.DB.prepare(
    'SELECT id, team_id, prefix, created_at FROM api_keys WHERE team_id = ? ORDER BY created_at DESC',
  ).bind(teamId).all();
  return rows.results;
}

export async function createKey(env: Env, teamId: string): Promise<{ id: string; key: string; prefix: string }> {
  const key = newApiToken();
  const prefix = key.slice(0, 10);
  const id = crypto.randomUUID();
  const hash = await sha256Hex(key);
  await env.DB.prepare('INSERT INTO api_keys (id, team_id, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, teamId, hash, prefix, Date.now()).run();
  return { id, key, prefix };
}

export async function deleteKey(env: Env, teamId: string, keyId: string) {
  await env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND team_id = ?').bind(keyId, teamId).run();
}

/** Resolve a bearer token to a team id; returns null when unknown. */
export async function teamForToken(env: Env, bearer: string | null): Promise<string | null> {
  if (!bearer?.startsWith('404l_')) return null;
  const hash = await sha256Hex(bearer);
  const row = await env.DB.prepare('SELECT team_id FROM api_keys WHERE key_hash = ?').bind(hash)
    .first<{ team_id: string }>();
  return row?.team_id ?? null;
}
