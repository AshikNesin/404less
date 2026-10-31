import type { Hono } from "hono";
import type { AppEnv } from "@groot/core/types";
import { env } from "@groot/core/env";
import * as authService from "@groot/core/auth/auth.service";
import { createWebApp } from "../../apps/web/src/server/app";

export type TestApp = Hono<AppEnv>;

export function createTestApp(): TestApp {
  return createWebApp();
}

export interface JsonResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: {
    success: boolean;
    data?: T;
    error?: { code: string; message: string; details?: unknown };
  };
}

/** Send a request and parse the JSON envelope (204/empty bodies yield `{ success: true }`). */
export async function api<T = unknown>(
  app: TestApp,
  path: string,
  init: RequestInit & { json?: unknown; token?: string } = {},
): Promise<JsonResponse<T>> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const response = await app.request(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : { success: response.ok };
  return { status: response.status, headers: response.headers, body };
}

let userCounter = 0;

/** Create a user and log in; returns a bearer token for `api()`. */
export async function signIn(app: TestApp, overrides: { email?: string; password?: string } = {}) {
  userCounter += 1;
  const email = overrides.email ?? `user${userCounter}@example.com`;
  const password = overrides.password ?? "correct horse battery staple";
  const user = await authService.createUser({ email, password, name: "Test User" });
  const login = await api<{ token: string }>(app, "/api/v1/auth/login", {
    method: "POST",
    json: { email, password },
  });
  if (login.status !== 200 || !login.body.data) throw new Error(`login failed: ${login.status}`);
  return {
    user,
    email,
    password,
    token: login.body.data.token,
    cookie: login.headers.get("set-cookie"),
  };
}

export const adminHeaders = () => ({ "x-admin-auth-key": env.ADMIN_AUTH_KEY });
