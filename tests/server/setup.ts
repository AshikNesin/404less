/**
 * Vitest setup for server tests: the app's boot sequence against a fresh
 * in-memory SQLite database per test file (migrations applied) and in-memory
 * file storage. `NODE_ENV=test` disables the job queue, so tests drive
 * `runTick()` explicitly; logs are silent.
 */
import { memoryStorage } from "@groot/core/storage/memory";
import { startWebApp } from "../../apps/web/src/server/app";
import { openDatabase } from "../../apps/web/src/server/db/node";

process.env.NODE_ENV = "test";

startWebApp({
  env: { ...process.env, NODE_ENV: "test", DATABASE_URL: ":memory:", LOG_LEVEL: "silent" },
  db: openDatabase(":memory:"),
  storage: memoryStorage(),
});
