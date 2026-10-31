import { describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { createApp } from "@groot/core/app";
import { rateLimit } from "@groot/core/middlewares/rate-limit.middleware";
import { ok } from "@groot/core/utils/api-response.utils";
import type { AppEnv } from "@groot/core/types";
import { api } from "../helpers";

function buildApp() {
  return createApp({
    routes(app) {
      const r = new Hono<AppEnv>();
      r.get(
        "/limited",
        rateLimit({
          window: () => ({ windowMs: 60_000, max: 2 }),
          message: "slow down",
          binding: "TEST_LIMITER",
        }),
        (c) => ok(c, { fine: true }),
      );
      app.route("/api/v1", r);
    },
  });
}

describe("rateLimit middleware", () => {
  it("counts per client IP within the window and sets standard headers", async () => {
    const app = buildApp();
    const headers = { "x-forwarded-for": "10.0.0.1, 192.168.0.1" };
    const first = await api(app, "/api/v1/limited", { headers });
    expect(first.status).toBe(200);
    expect(first.headers.get("RateLimit-Limit")).toBe("2");
    expect(first.headers.get("RateLimit-Remaining")).toBe("1");
    expect((await api(app, "/api/v1/limited", { headers })).status).toBe(200);
    const third = await api(app, "/api/v1/limited", { headers });
    expect(third.status).toBe(429);
    expect(third.body.error).toMatchObject({ code: "TOO_MANY_REQUESTS", message: "slow down" });
    // Another client is unaffected.
    expect(
      (await api(app, "/api/v1/limited", { headers: { "cf-connecting-ip": "10.0.0.2" } })).status,
    ).toBe(200);
  });

  it("prefers a Workers rate-limit binding when the environment provides one", async () => {
    const app = buildApp();
    const calls: string[] = [];
    const bindings = {
      TEST_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          calls.push(key);
          return { success: calls.length < 2 };
        },
      },
    };
    const request = () =>
      app.request("/api/v1/limited", { headers: { "cf-connecting-ip": "1.2.3.4" } }, bindings);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
    expect(calls).toEqual(["1.2.3.4", "1.2.3.4"]);
  });
});
