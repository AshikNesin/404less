---
"404less": patch
---

Deploys of an instance set up before crawling moved off Queues no longer fail with "Queue handler is missing" (code 11001): the Worker keeps a queue handler that acknowledges and drops leftover messages while the old `404less-crawl` consumer is still attached. Delete the queue afterwards to detach it.
