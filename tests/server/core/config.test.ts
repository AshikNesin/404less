import { describe, expect, it } from "vite-plus/test";
import { parseEnv } from "@groot/core/env";
import { buildConfig, defaultConfig, defineConfig } from "@groot/core/config";

describe("config", () => {
  it("derives defaults from the environment", () => {
    const dev = defaultConfig(
      parseEnv({ PORT: "4321", CORS_ALLOWED_ORIGINS: "https://a.com, https://b.com" }),
    );
    expect(dev.app.port).toBe(4321);
    expect(dev.cors.origins).toEqual(["https://a.com", "https://b.com"]);
    expect(dev.logging.level).toBe("debug");
    expect(dev.jobs.enabled).toBe(true);

    const test = defaultConfig(parseEnv({ NODE_ENV: "test" }));
    expect(test.jobs.enabled).toBe(false);
    expect(test.logging.level).toBe("silent");

    expect(defaultConfig(parseEnv({ LOG_LEVEL: "warn" })).logging.level).toBe("warn");
  });

  it("feeds Sentry from the validated env", () => {
    expect(defaultConfig(parseEnv({})).sentry).toEqual({ dsn: "", release: undefined });
    expect(
      defaultConfig(
        parseEnv({ SENTRY_DSN: "https://key@sentry.example/1", SENTRY_RELEASE: "groot@abc1234" }),
      ).sentry,
    ).toEqual({ dsn: "https://key@sentry.example/1", release: "groot@abc1234" });
  });

  it("deep-merges overrides and replaces arrays", () => {
    const env = parseEnv({});
    const config = buildConfig(env, {
      app: { name: "Acme" },
      cors: { origins: ["x"] },
      jobs: { batchSize: 2 },
    });
    expect(config.app.name).toBe("Acme");
    expect(config.app.port).toBe(3000);
    expect(config.cors.origins).toEqual(["x"]);
    expect(config.jobs.batchSize).toBe(2);
    expect(config.jobs.retryLimit).toBe(3);
  });

  it("accepts a function of the env", () => {
    const overrides = defineConfig((env) => ({ jobs: { enabled: env.NODE_ENV !== "test" } }));
    expect(buildConfig(parseEnv({ NODE_ENV: "test" }), overrides).jobs.enabled).toBe(false);
    expect(buildConfig(parseEnv({ NODE_ENV: "development" }), overrides).jobs.enabled).toBe(true);
  });
});
