---
"404less": minor
---

Crawling no longer uses Cloudflare Queues, whose Free-plan 10k ops/day ran out within one crawl. A crawl run's pages and links are rows in D1 (`crawl_tasks`, migration 0010), worked through by a cron tick every minute within the Free plan's per-invocation limits (40 fetches, 5 parsed pages, 40 s); "Crawl now", sitemap imports and the dashboard's polling start a tick right away. Scheduled crawls run every `CRAWL_INTERVAL_HOURS` (default 24, was every 30 minutes), "pages per crawl" now caps every page a run fetches, and unchanged pages no longer rewrite their links. Delete the `404less-crawl` queue before deploying: while its consumer is attached, Cloudflare rejects the Worker ("Queue handler is missing").
