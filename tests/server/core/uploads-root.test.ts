import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { LOCAL_UPLOADS_ROOT, uploadsRoot } from "@groot/core/storage/node";

describe("uploadsRoot", () => {
  it("puts production uploads next to the SQLite file", () => {
    expect(uploadsRoot({ NODE_ENV: "production", DATABASE_URL: "file:/data/prod.db" })).toBe(
      "/data/uploads",
    );
    expect(uploadsRoot({ NODE_ENV: "production", DATABASE_URL: "file:./tmp/app.db" })).toBe(
      path.resolve("tmp/uploads"),
    );
  });

  it("honours UPLOADS_DIR in every environment", () => {
    expect(
      uploadsRoot({
        NODE_ENV: "production",
        DATABASE_URL: "file:/data/prod.db",
        UPLOADS_DIR: "/mnt/files",
      }),
    ).toBe("/mnt/files");
    expect(
      uploadsRoot({ NODE_ENV: "development", DATABASE_URL: ":memory:", UPLOADS_DIR: "/tmp/u" }),
    ).toBe("/tmp/u");
  });

  it("keeps the checkout folder in development, tests and in-memory databases", () => {
    expect(uploadsRoot({ NODE_ENV: "development", DATABASE_URL: "file:./data/dev.db" })).toBe(
      LOCAL_UPLOADS_ROOT,
    );
    expect(uploadsRoot({ NODE_ENV: "production", DATABASE_URL: ":memory:" })).toBe(
      LOCAL_UPLOADS_ROOT,
    );
  });
});
