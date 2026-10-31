// Team API keys: bearer tokens for the REST API and MCP server.
// Keys are shown once at creation; only sha256 hashes are stored.
import type { Env } from "../../types";
import { newApiToken, sha256Hex } from "../../lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { apiKeys, db } from "../../db";

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

export async function createKey(
  env: Env,
  teamId: string,
): Promise<{ id: string; key: string; prefix: string }> {
  const key = newApiToken();
  const prefix = key.slice(0, 10);
  const id = crypto.randomUUID();
  const hash = await sha256Hex(key);
  await db
    .insert(apiKeys)
    .values({ id, team_id: teamId, key_hash: hash, prefix, created_at: Date.now() });
  return { id, key, prefix };
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
