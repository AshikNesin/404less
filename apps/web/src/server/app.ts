import { Hono } from "hono";
import { createApp, type CreateAppOptions } from "@groot/core/app";
import { bootstrap, type BootstrapOptions } from "@groot/core/bootstrap";
import { auth } from "./api/auth/auth.routes";
import { channels } from "./api/channels/channels.routes";
import { embed } from "./api/embed/embed.routes";
import { ingest } from "./api/ingest/ingest.routes";
import { keys } from "./api/keys/keys.routes";
import { links } from "./api/links/links.routes";
import { mcp } from "./api/mcp/mcp.routes";
import { sitemap } from "./api/sitemap/sitemap.routes";
import { sites } from "./api/sites/sites.routes";
import { appConfig } from "./config";
import { sessionMiddleware } from "./middlewares/session.middleware";
import type { AppBindings } from "./types";
import { staticAssets } from "./worker/static-assets";

/** What a runtime supplies: its env source and adapters. Everything else is the app's. */
export type WebRuntime = Omit<BootstrapOptions, "config">;

/**
 * The public widget contract, frozen forever: customer 404 pages call these
 * from their own origin (no credentials), so they answer any origin with
 * `Access-Control-Allow-Origin: *` instead of the app's CORS allow-list.
 */
export const WIDGET_PATHS = ["/api/track", "/api/suggestions"];

/**
 * The one boot sequence for the Node and Workers entries and the test setup:
 * bootstrap core with the app config, then build the HTTP app.
 */
export function startWebApp(runtime: WebRuntime) {
  bootstrap({ ...runtime, config: appConfig });
  return createWebApp();
}

/** The HTTP app shared by the Node and Workers entries. */
export function createWebApp(options: Omit<CreateAppOptions, "routes" | "openCorsPaths"> = {}) {
  return createApp({
    ...options,
    openCorsPaths: WIDGET_PATHS,
    routes(app) {
      // Public — paths are external contracts; never move them.
      app.route("/", embed); // GET /embed.js
      app.route("/api", ingest); // POST /api/track, GET /api/suggestions
      app.route("/", mcp); // /mcp (MCP streamable HTTP, bearer API key)
      app.route("/api/v1/auth", auth); // POST magic, GET verify, POST logout
      // Sign-in links emailed before the move to /api/v1 (15-minute TTL).
      app.get("/auth/verify", (c) =>
        c.redirect(`/api/v1/auth/verify?token=${encodeURIComponent(c.req.query("token") ?? "")}`),
      );

      // Dashboard API: magic-link session cookie (see session.middleware.ts).
      const api = new Hono<AppBindings>();
      api.use(sessionMiddleware);
      api.route("/", sites); // me, teams, sites, overview, crawl, events
      api.route("/", sitemap); // import-sitemap, known-urls
      api.route("/", channels); // channels CRUD, alerts history, test-send
      api.route("/", links); // broken-link triage
      api.route("/", keys); // API keys
      app.route("/api/v1", api as never);

      // Workers: marketing site, SPA shell, real 404s (ASSETS binding). Last.
      app.route("/", staticAssets as never);
    },
  });
}
