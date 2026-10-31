import { defineConfig } from "@groot/core/config";

/**
 * App configuration. Anything not set here comes from `defaultConfig()` in
 * `@groot/core/config`, which derives sensible values from the environment
 * (`NODE_ENV`, `PORT`, `CORS_ALLOWED_ORIGINS`, `LOG_LEVEL`, ...).
 *
 * 404less-specific settings (`MAX_SITES_PER_TEAM`, `EVENT_RETENTION_DAYS`,
 * `RESEND_API_KEY`, `MAIL_FROM`) are runtime bindings, read from `c.env` — see
 * `types.ts`.
 */
export const appConfig = defineConfig({
  app: { name: "404less" },
  // No groot job queue: crawling runs on Cloudflare Queues, retention and the
  // title backlog on the Worker's own cron triggers (worker/cron.ts).
  jobs: { enabled: false },
});
