import { describe, expect, it } from "vite-plus/test";
import { DEV_DEFAULTS, defaultDatabaseUrl, parseEnv } from "@groot/core/env";

describe("env", () => {
  it("boots with development defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe("file:./data/dev.db");
    expect(env.PORT).toBe(3000);
    expect(env.JWT_SECRET_KEY).toBe(DEV_DEFAULTS.JWT_SECRET_KEY);
    expect(env.ADMIN_AUTH_KEY).toBe(DEV_DEFAULTS.ADMIN_AUTH_KEY);
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ PORT: "", LOG_LEVEL: "", JWT_SECRET_KEY: "" });
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.JWT_SECRET_KEY).toBe(DEV_DEFAULTS.JWT_SECRET_KEY);
  });

  it("coerces and validates values", () => {
    expect(parseEnv({ PORT: "8080" }).PORT).toBe(8080);
    expect(() => parseEnv({ PORT: "nope" })).toThrow(/PORT/);
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    expect(() => parseEnv({ JWT_SECRET_KEY: "short" })).toThrow(/32 characters/);
  });

  it("refuses development fallbacks in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(
      /JWT_SECRET_KEY, ADMIN_AUTH_KEY, ORIGIN, RP_ID/,
    );
    const env = parseEnv({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "x".repeat(40),
      ADMIN_AUTH_KEY: "admin",
      ORIGIN: "https://app.example.com",
      RP_ID: "app.example.com",
    });
    expect(env.ORIGIN).toBe("https://app.example.com");
    expect(env.DATABASE_URL).toBe("file:/data/prod.db");
  });

  it("keeps an explicit DATABASE_URL in every environment", () => {
    expect(parseEnv({ DATABASE_URL: ":memory:" }).DATABASE_URL).toBe(":memory:");
    expect(defaultDatabaseUrl("test")).toBe("file:./data/dev.db");
    expect(defaultDatabaseUrl("production")).toBe("file:/data/prod.db");
  });

  it("drops variables outside the schema", () => {
    const env = parseEnv({ SOURCE_COMMIT: "abc", OPENAI_API_KEY: "sk-test" });
    expect(env).not.toHaveProperty("SOURCE_COMMIT");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("ignores non-string binding values (Workers env objects)", () => {
    const env = parseEnv({ DB: { prepare() {} } as unknown as string, PORT: "4000" });
    expect(env.PORT).toBe(4000);
  });
});
