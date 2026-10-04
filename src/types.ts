// Shared Worker bindings & types.
export type Env = {
  DB: D1Database;
  DIGEST: DurableObjectNamespace;
  CRAWLQ: Queue<CrawlMessage>;
  /** Cloudflare Email Service binding (send_email) — optional; used when no RESEND_API_KEY. */
  EMAIL?: SendEmail;
  MAX_SITES_PER_TEAM?: string;
  DEV_MAILER?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

export type CrawlMessage =
  | { kind: 'crawl-site'; siteId: string }                 // start a site crawl (enqueue seed pages)
  | { kind: 'fetch-page'; siteId: string; url: string; depth: number } // fetch page, extract links
  | { kind: 'check-link'; siteId: string; url: string; sourceUrl: string; anchor?: string };

export type AuthContext = {
  userId: string;
  email: string;
};
