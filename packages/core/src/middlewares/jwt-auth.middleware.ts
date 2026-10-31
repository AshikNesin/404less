import { createMiddleware } from "hono/factory";
import { Boom } from "../errors";
import { verifyToken } from "../utils/jwt.utils";
import { extractAuthToken } from "../utils/auth-cookie.utils";
import type { AppEnv } from "../types";

/** Requires a valid JWT (cookie or bearer) and sets `c.get("user")`. */
export const jwtAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractAuthToken(c);
  if (!token) throw Boom.unauthorized("No token provided");
  c.set("user", await verifyToken(token));
  await next();
});
