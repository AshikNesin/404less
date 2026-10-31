import { Hono } from "hono";
import { jwtAuthMiddleware } from "../middlewares/jwt-auth.middleware";
import { authRateLimiter } from "../middlewares/rate-limit.middleware";
import { parseBody, parseId, requireUser } from "../utils/controller.utils";
import { setAuthCookie } from "../utils/auth-cookie.utils";
import { ok, noContent } from "../utils/api-response.utils";
import * as passkeyService from "./passkey.service";
import {
  generateAuthenticationOptionsSchema,
  updatePasskeyNameSchema,
  verifyAuthenticationSchema,
  verifyRegistrationSchema,
} from "./passkey.schema";
import type { AppEnv } from "../types";

const router = new Hono<AppEnv>();

// Registration (signed in)
router.post("/register/options", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  return ok(c, await passkeyService.generateRegistrationOptions({ userId }));
});

router.post("/register/verify", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  const payload = await parseBody(c, verifyRegistrationSchema);
  return ok(
    c,
    await passkeyService.verifyRegistration({
      userId,
      response: payload.response,
      credentialName: payload.credentialName,
    }),
  );
});

// Login (public)
router.post("/login/options", authRateLimiter, async (c) => {
  const body = await parseBody(c, generateAuthenticationOptionsSchema);
  return ok(c, await passkeyService.generateAuthenticationOptions({ email: body.email }));
});

router.post("/login/verify", authRateLimiter, async (c) => {
  const body = await parseBody(c, verifyAuthenticationSchema);
  const result = await passkeyService.verifyAuthentication({ response: body.response });
  setAuthCookie(c, result.token);
  return ok(c, result);
});

// Management (signed in)
router.get("/list", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  return ok(c, await passkeyService.listPasskeys({ userId }));
});

router.delete("/:id", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  await passkeyService.deletePasskey({ userId, passkeyId: parseId(c.req.param("id")) });
  return noContent(c);
});

router.patch("/:id", jwtAuthMiddleware, async (c) => {
  const { userId } = requireUser(c);
  const payload = await parseBody(c, updatePasskeyNameSchema);
  return ok(
    c,
    await passkeyService.updatePasskeyName({
      userId,
      passkeyId: parseId(c.req.param("id")),
      credentialName: payload.credentialName,
    }),
  );
});

export default router;
