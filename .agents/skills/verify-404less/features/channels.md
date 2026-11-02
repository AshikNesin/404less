# Notification channels

## Sub-features

- Per-team channels: Slack (incoming webhook URL), Pushover (user + app token), email (address). CRUD under `POST/PATCH/DELETE /api/v1/teams/:teamId/channels…`; secrets never returned after creation.
- Per-site: notify on/off, digest window (`digest_minutes` 5–1440, default 15) — one grouped digest per window per site via DigestDO; ignored links never alert.
- Test send button per channel; alerts history per site.

## How to get to it (user POV)

Team section in the sidebar → "Notifications".

## Driving it

The static busybox fixture has no webhook sink — for a Slack-webhook check, build one from `tests/e2e/fixtures.ts`'s `/slack-hook` handler (that Playwright fixture serves it on a random port) or run the e2e suite. Create channel via API/UI, trigger visitor hits, then flush the digest: `curl -X POST https://digest/flush` is internal — instead wait out the window or use the UI's test send, and assert on `webhookCalls` / `alerts` rows. See tests/e2e/team-settings.spec.ts and tests/worker/m3.test.ts (digest DO tests drive the DO directly).

## Gotchas

- Secrets (webhook URLs, tokens) are write-only: verification after creation must go through behavior (test send), not by reading them back.
- The digest DO buffers per site and flushes on its alarm; on the Node instance DO stand-ins flush on the same alarm semantics — a 5-minute window means minutes of waiting; prefer the test-send path or shrink the window first.
