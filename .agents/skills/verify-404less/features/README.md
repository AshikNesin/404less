# Feature map

One file per user-facing feature: what it is, how a user reaches it, how to drive it with the skill's harness, and what observable end state proves it. Start here to pick coverage; the SKILL.md has the launch/doctor/cleanup recipe.

| Feature                       | File                | Primary proof                                                                  |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| Sign-in & session             | auth.md             | magic link → session cookie → /api/v1/me                                       |
| Sites & onboarding            | sites.md            | site created, snippet + checklist shown, duplicate refused                     |
| Visitor 404 tracking + widget | visitor-tracking.md | /api/track → open link row; embed renders ranked suggestion on the fixture 404 |
| Broken-links triage           | triage.md           | bulk resolve/ignore moves counts; visitor hit reopens resolved                 |
| Sitemap import & known pages  | sitemap-import.md   | imported count, known URLs power suggestions                                   |
| Crawler                       | crawler.md          | crawl-report rows with found_on + anchor; auto-resolve of fixed links          |
| Notification channels         | channels.md         | Slack/email/Pushover CRUD + test send + digest window                          |
| API keys & MCP                | api-mcp.md          | key works on /mcp (4 read-only tools) and /api/v1 bearer                       |
