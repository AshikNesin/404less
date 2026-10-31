// Team API keys: bearer tokens for the REST API and MCP server.
// Keys are shown once at creation; only sha256 hashes are stored.
import type { Env } from "../../types";
import { newApiToken, sha256Hex } from "../../lib/auth";
import { and, desc, eq, sql } from "drizzle-orm";
import { apiKeys, changes, db } from "../../db";

export type ApiKeyRow = {
  id: string;
  team_id: string;
  key_hash: string;
  prefix: string;
  created_at: number;
};

export async function listKeys(env: Env, teamId: string) {
  return db
    .select({
      id: apiKeys.id,
      team_id: apiKeys.team_id,
      prefix: apiKeys.prefix,
      created_at: apiKeys.created_at,
    })
    .from(apiKeys)
    .where(eq(apiKeys.team_id, teamId))
    .orderBy(desc(apiKeys.created_at));
}

/** Keys per team: a hard cap protecting self-hosters' D1. */
export const MAX_KEYS_PER_TEAM = 20;

/**
 * Create a key unless the team already has MAX_KEYS_PER_TEAM. The count and the
 * insert are one statement (INSERT … SELECT … WHERE count < cap), so concurrent
 * requests can't push a team past the cap. Returns null at the cap.
 */
export async function createKey(
  env: Env,
  teamId: string,
): Promise<{ id: string; key: string; prefix: string } | null> {
  const key = newApiToken();
  const prefix = key.slice(0, 10);
  const id = crypto.randomUUID();
  const hash = await sha256Hex(key);
  const result = await db.run(
    sql`INSERT INTO ${apiKeys} (id, team_id, key_hash, prefix, created_at)
        SELECT ${id}, ${teamId}, ${hash}, ${prefix}, ${Date.now()}
        WHERE (SELECT COUNT(*) FROM ${apiKeys} WHERE team_id = ${teamId}) < ${MAX_KEYS_PER_TEAM}`,
  );
  return changes(result) === 1 ? { id, key, prefix } : null;
}

export async function deleteKey(env: Env, teamId: string, keyId: string) {
  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.team_id, teamId)));
}

/** Resolve a bearer token to a team id; returns null when unknown. */
export async function teamForToken(env: Env, bearer: string | null): Promise<string | null> {
  if (!bearer?.startsWith("404l_")) return null;
  const hash = await sha256Hex(bearer);
  const row = await db
    .select({ team_id: apiKeys.team_id })
    .from(apiKeys)
    .where(eq(apiKeys.key_hash, hash))
    .get();
  return row?.team_id ?? null;
}
