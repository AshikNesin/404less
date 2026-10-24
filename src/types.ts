// Shared Worker bindings & types.
export type Env = {
  DB: D1Database;
  DIGEST: DurableObjectNamespace;
  CRAWLQ: Queue<CrawlMessage>;
  MAX_SITES_PER_TEAM?: string;
  EVENT_RETENTION_DAYS?: string;
  /** RateLimiterDO binding (declared in wrangler.jsonc) */
  RATELIMIT: DurableObjectNamespace;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

export type CrawlMessage =
  | { kind: 'crawl-site'; siteId: string; manual?: boolean }          // start a run (enqueue seed pages + rechecks)
  | { kind: 'fetch-page'; siteId: string; url: string; depth: number } // fetch page, extract links
  | { kind: 'check-link'; siteId: string; url: string; sourceUrl: string; anchor?: string };

export type AuthContext = {
  userId: string;
  email: string;
};
