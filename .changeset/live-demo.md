---
"404less": minor
---

A read-only live demo: with `DEMO_ENABLED=1`, `/app/demo` signs anyone in to a shared sample account (two sites with visitor 404s, crawl results, suggestions and alert history) without creating an account. The demo account can read everything and change nothing (writes answer 403). Its sites take no visitor hits and are never crawled, and its data is rewritten on the first visit after 24 hours so timestamps stay current. The marketing site and the sign-in page link to it. `wrangler.jsonc` sets `DEMO_ENABLED` to `"1"`, so new deploys offer the demo; set it to `"0"` to turn it off (unset is off).
