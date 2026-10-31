// Authenticated API-key management (per team).
import { Hono } from "hono";
import { createKey, deleteKey, listKeys, MAX_KEYS_PER_TEAM } from "../keys/keys.service";
import type { Env } from "../../types";
import { and, eq } from "drizzle-orm";
import { db, teamMembers } from "../../db";

export const keys = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** The user's role in the team, or null when they aren't a member. */
async function teamRole(teamId: string | undefined, userId: string): Promise<string | null> {
  if (!teamId) return null;
  const row = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)))
    .get();
  return row?.role ?? null;
}

keys.get("/teams/:teamId/keys", async (c) => {
  if (!(await teamRole(c.req.param("teamId"), c.get("userId"))))
    return c.json({ error: "not found" }, 404);
  return c.json({ keys: await listKeys(c.env, c.req.param("teamId")) });
});

keys.post("/teams/:teamId/keys", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  if (role === "viewer") return c.json({ error: "viewers cannot manage API keys" }, 403);
  const created = await createKey(c.env, teamId);
  if (!created) return c.json({ error: `key limit reached (max ${MAX_KEYS_PER_TEAM})` }, 402);
  return c.json({ key: { id: created.id, prefix: created.prefix }, secret: created.key }, 201); // shown once
});

keys.delete("/teams/:teamId/keys/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  if (role === "viewer") return c.json({ error: "viewers cannot manage API keys" }, 403);
  await deleteKey(c.env, teamId, c.req.param("id"));
  return c.json({ ok: true });
});
