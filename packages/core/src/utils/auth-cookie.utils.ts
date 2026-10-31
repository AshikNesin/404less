import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env";
import { jwtExpiresInMs } from "./jwt.utils";
import type { AppContext } from "../types";

const TOKEN_COOKIE_NAME = "token";

export function setAuthCookie(c: AppContext, token: string): void {
  const isProduction = env.NODE_ENV === "production";
  setCookie(c, TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "Strict" : "Lax",
    maxAge: Math.floor(jwtExpiresInMs() / 1000),
    path: "/",
  });
}

export function clearAuthCookie(c: AppContext): void {
  deleteCookie(c, TOKEN_COOKIE_NAME, { path: "/" });
}

/** The JWT from the auth cookie, falling back to `Authorization: Bearer`. */
export function extractAuthToken(c: AppContext): string | undefined {
  const cookie = getCookie(c, TOKEN_COOKIE_NAME);
  if (cookie) return cookie;
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return undefined;
}
