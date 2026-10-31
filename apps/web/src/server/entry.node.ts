import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "@groot/core/env";
import { config } from "@groot/core/config";
import { logger } from "@groot/core/logger";
import { markShuttingDown } from "@groot/core/app";
import type { ErrorReporter } from "@groot/core/errors";
import { notificationService } from "@groot/core/notification/notification.service";
import { startWorkers, stopWorkers } from "@groot/jobs/server/worker";
import { startWebApp } from "./app";
import { openDatabase } from "./db/node";
import { createNodeBindings } from "./node-bindings";

/**
 * Node entry: SQLite on disk, in-process stand-ins for the Workers bindings
 * (node-bindings.ts). For development (`pnpm dev`): Vite serves the client
 * with HMR on the same port. 404less runs in production on Cloudflare
 * Workers (entry.worker.ts); this entry is not a supported production target.
 */

if (existsSync(".env")) process.loadEnvFile(".env");

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

// Sentry is loaded below only when a DSN is configured: importing @sentry/node
// costs tens of MB of RSS even with nothing to send, and most self-hosted
// instances run without error reporting. Until it initialises, this slot is a
// no-op — the same outcome as calling Sentry before init().
let captureException: ErrorReporter | undefined;

// scripts/build.mjs bakes the release it uploads source maps under into
// `process.env.SENTRY_RELEASE`; listing it first keeps a runtime value winning.
const app = startWebApp({
  env: { SENTRY_RELEASE: process.env.SENTRY_RELEASE, ...process.env },
  db: (validated) => openDatabase(validated.DATABASE_URL),
  reportError: (error, context) => captureException?.(error, context),
});

if (config.sentry.dsn) {
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: config.sentry.dsn,
    release: config.sentry.release,
    environment: env.NODE_ENV,
    sendDefaultPii: true,
  });
  captureException = (error, extra) => Sentry.captureException(error, { extra });
}
const port = config.app.port;
// What Workers would pass as `env`: vars plus the queue / Durable Object stand-ins.
const bindings = createNodeBindings();
/** Hono's fetch with the bindings attached (node-server's own env is kept alongside). */
const fetchWithBindings = (request: Request, nodeEnv?: object) =>
  app.fetch(request, { ...nodeEnv, ...bindings });
const clientRoot = path.resolve(process.cwd(), "apps/web");

async function main(): Promise<void> {
  const server = isProduction ? await createProductionServer() : await createDevServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  logger.info(`Server is running on http://localhost:${port}`);

  if (config.jobs.enabled) {
    await startWorkers();
  } else {
    logger.info("Job queue disabled (config.jobs.enabled = false)");
  }

  if (isProduction) {
    notificationService
      .sendServerStartupNotification(port, env.NODE_ENV)
      .catch((error: unknown) =>
        logger.error({ err: error }, "Failed to send startup notification"),
      );
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    markShuttingDown();
    // Give the load balancer a moment to stop routing traffic here.
    if (isProduction) await new Promise((r) => setTimeout(r, 2000));
    await stopWorkers();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => void shutdown(signal));
  }
}

/** Production: Hono serves the API and the built client (SPA fallback to index.html). */
async function createProductionServer(): Promise<http.Server> {
  const clientDist = [
    path.resolve(here, "../client"),
    path.resolve(process.cwd(), "dist/client"),
  ].find((candidate) => existsSync(path.join(candidate, "index.html")));
  if (!clientDist) throw new Error("Client build not found. Run `pnpm build` first.");
  const indexHtml = readFileSync(path.join(clientDist, "index.html"), "utf8");

  app.use(
    "/*",
    serveStatic({
      root: path.relative(process.cwd(), clientDist) || ".",
      onFound: (filePath, c) => {
        // Hashed assets can be cached forever; everything else must revalidate.
        c.header(
          "Cache-Control",
          filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    return c.html(indexHtml, 200, { "Cache-Control": "no-cache" });
  });

  return serve(
    { fetch: fetchWithBindings, port, hostname: "0.0.0.0" },
    () => undefined,
  ) as http.Server;
}

/** Development: Vite in middleware mode handles everything that is not the API. */
async function createDevServer(): Promise<http.Server> {
  const { createServer: createViteServer } = await import("vite-plus");
  const server = http.createServer();
  const api = getRequestListener(fetchWithBindings);

  let ws: Record<string, unknown> = { port: port + 1 };
  const tunnel = process.env.VITE_HMR_URL;
  const portless = process.env.PORTLESS_URL;
  if (tunnel) {
    ws = { server, protocol: "wss", host: tunnel, clientPort: 443 };
  } else if (portless) {
    try {
      const url = new URL(portless);
      ws = {
        server,
        protocol: url.protocol === "https:" ? "wss" : "ws",
        host: url.hostname,
        clientPort: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      };
    } catch (error) {
      logger.warn({ err: error }, "Failed to parse PORTLESS_URL for HMR config");
    }
  }

  const vite = await createViteServer({
    root: clientRoot,
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: { server }, ws } as never,
    appType: "custom",
  });

  const template = () => readFileSync(path.join(clientRoot, "index.html"), "utf8");
  server.on("request", (req, res) => {
    const url = req.url ?? "/";
    if (
      url.startsWith("/api/") ||
      url.startsWith("/auth/") ||
      url === "/embed.js" ||
      url.startsWith("/mcp") ||
      url === "/health" ||
      url === "/ready"
    ) {
      void api(req, res);
      return;
    }
    vite.middlewares(req, res, () => {
      vite
        .transformIndexHtml(url, template())
        .then((html) => {
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        })
        .catch((error: unknown) => {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.stack : String(error));
        });
    });
  });

  logger.info("Vite dev middleware enabled");
  return server;
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
