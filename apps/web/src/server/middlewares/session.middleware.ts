import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { db, teams } from "../db";
import { SESSION_COOKIE, verifySession } from "../lib/auth";
import { teamForToken } from "../api/keys/keys.service";
import type { AppBindings } from "../types";
import { eq } from "drizzle-orm";

/**
 * Guards the dashboard API: a valid magic-link session cookie sets
 * `c.get("userId")`, anything else is a 401. 404less keeps its own session
 * (text user ids, secret auto-generated in app_meta) instead of core's JWT
 * middleware, whose `AuthUser.userId` is numeric.
 *
 * An API key bearer token also works (the /agent page documents it for the
 * REST API): it acts as the key's team owner, and is confined to that team —
 * `bearerTeamId` makes every team-scoped lookup below reject other teams.
 */
export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const teamId = await teamForToken(c.env, auth.slice(7));
    if (!teamId) return c.json({ error: "invalid api key" }, 401);
    const owner = await db
      .select({ owner_user_id: teams.owner_user_id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();
    const userId = owner?.owner_user_id;
    if (!userId) return c.json({ error: "invalid api key" }, 401);
    c.set("userId", userId);
    c.set("bearerTeamId", teamId);
    await next();
    return;
  }
  const userId = await verifySession(getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});
