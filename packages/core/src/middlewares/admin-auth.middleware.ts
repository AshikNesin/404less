import { createMiddleware } from "hono/factory";
import { Boom } from "../errors";
import { env } from "../env";
import { timingSafeEqual, utf8Encode } from "../utils/encoding.utils";
import type { AppEnv } from "../types";

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8Encode(value)));
}

/** Requires the `X-Admin-Auth-Key` header to match `ADMIN_AUTH_KEY`. */
export const adminAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const provided = c.req.header("x-admin-auth-key");
  if (!provided) throw Boom.unauthorized("Admin authentication required");
  // Hash both sides so the comparison is constant-time regardless of length.
  const [a, b] = await Promise.all([sha256(provided), sha256(env.ADMIN_AUTH_KEY)]);
  if (!timingSafeEqual(a, b)) throw Boom.forbidden("Invalid admin auth key");
  await next();
});
