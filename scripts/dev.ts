#!/usr/bin/env tsx
/**
 * Local development: seed the SQLite database (which also applies migrations),
 * then run the Node entry under tsx watch. Vite serves the client with HMR on
 * the same port.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { parseEnv } from "@groot/core/env";

// Load .env before resolving DATABASE_URL: the seed step and the server inherit
// this process.env, and loadEnvFile never overrides a variable already set.
if (existsSync(".env")) process.loadEnvFile(".env");

let devServer: ChildProcess | null = null;
let isShuttingDown = false;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", env: process.env });
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`)),
    );
    proc.on("error", reject);
  });
}

async function main() {
  const databaseUrl = parseEnv(process.env).DATABASE_URL;
  console.log(`\n🗄️  SQLite database: ${databaseUrl}\n`);

  console.log("👤 Applying migrations and seeding...\n");
  await run("node_modules/.bin/tsx", ["scripts/seed.ts"]);

  console.log("\n🚀 Starting dev server...\n");
  devServer = spawn(
    "node_modules/.bin/tsx",
    ["watch", "--max-old-space-size=512", "apps/web/src/server/entry.node.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        ROLLDOWN_MAX_BLOCKING_THREADS: process.env.ROLLDOWN_MAX_BLOCKING_THREADS ?? "8",
        ROLLDOWN_WORKER_THREADS: process.env.ROLLDOWN_WORKER_THREADS ?? "2",
        TOKIO_WORKER_THREADS: process.env.TOKIO_WORKER_THREADS ?? "2",
        RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS ?? "2",
      },
    },
  );
  devServer.on("close", (code) => {
    if (!isShuttingDown) {
      console.error(`\n❌ Dev server exited unexpectedly (code ${code})`);
      void shutdown();
    }
  });
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n🛑 Shutting down...");
  if (devServer && !devServer.killed) devServer.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

main().catch((error) => {
  console.error("❌ Failed to start dev environment:", error);
  process.exit(1);
});
