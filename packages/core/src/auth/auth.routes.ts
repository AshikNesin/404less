import { Hono } from "hono";
import { jwtAuthMiddleware } from "../middlewares/jwt-auth.middleware";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware";
import { authRateLimiter } from "../middlewares/rate-limit.middleware";
import { parseBody, requireUser } from "../utils/controller.utils";
import { clearAuthCookie, setAuthCookie } from "../utils/auth-cookie.utils";
import { ok } from "../utils/api-response.utils";
import * as authService from "./auth.service";
import { createUserSchema, loginSchema } from "./auth.schema";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

router.post("/login", authRateLimiter, async (c) => {
  const body = await parseBody(c, loginSchema);
  const result = await authService.login(body);
  setAuthCookie(c, result.token);
  return ok(c, result);
});

router.post("/logout", jwtAuthMiddleware, (c) => {
  clearAuthCookie(c);
  return ok(c, { status: "logged out" });
});

router.get("/me", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  return ok(c, await authService.getUserById({ userId }));
});

// Admin-only user management (X-Admin-Auth-Key header).
router.post("/users", adminAuthMiddleware, async (c) => {
  const body = await parseBody(c, createUserSchema);
  return ok(c, await authService.createUser(body), 201);
});

router.get("/users", adminAuthMiddleware, async (c) => {
  return ok(c, await authService.getAllUsers());
});

export default router;
