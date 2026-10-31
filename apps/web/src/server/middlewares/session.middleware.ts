import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { SESSION_COOKIE, verifySession } from "../lib/auth";
import type { AppBindings } from "../types";

/**
 * Guards the dashboard API: a valid magic-link session cookie sets
 * `c.get("userId")`, anything else is a 401. 404less keeps its own session
 * (text user ids, secret auto-generated in app_meta) instead of core's JWT
 * middleware, whose `AuthUser.userId` is numeric.
 */
export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const userId = await verifySession(getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", userId);
  await next();
});
