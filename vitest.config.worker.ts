// 404less's integration suite: runs inside workerd (the real Workers runtime)
// via Miniflare against the production entry, with local D1, Queues and
// Durable Objects. Fully local: no Cloudflare account, no traffic to the edge.
// App-owned (listed in .groot/boilerplate-sync.json additional_exclusions);
// groot's Node suites run from vitest.config.server.ts.
import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./apps/web/src/server/entry.worker.ts",
      singleWorker: true,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          MAX_SITES_PER_TEAM: "2", // tighten quota for tests
          LOG_LEVEL: "silent",
          // a configured dashboard allow-list must not affect the public widget endpoints
          CORS_ALLOWED_ORIGINS: "https://dashboard.404less.test",
        },
        // scratch databases for the migration-continuity test
        d1Databases: ["LEGACY_DB", "FRESH_DB"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@groot/core": path.resolve(rootDir, "packages/core/src"),
    },
  },
  test: {
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["./tests/worker/apply-migrations.ts"],
  },
});
