# Sign-in & session

## Sub-features

- Magic-link request (`POST /api/v1/auth/magic`) and verification (`GET /api/v1/auth/verify?token=…`) → `f404_session` cookie (30 d).
- Dev mode on loopback without `RESEND_API_KEY`: link returned as `devLink` in the response; with email configured the link is emailed and never echoed.
- Single-use tokens; expired/used tokens redirect to `/app/login?error=expired`.
- First sign-in creates the user + a personal team (owner). Logout clears the cookie.

## How to get to it (user POV)

Dashboard at `/app` → redirected to `/app/login` → enter email → "Send sign-in link" → (dev) the SPA follows the link automatically and lands on the app.

## Driving it with curl

Follow SKILL.md "Sign in": POST /api/v1/auth/magic with a fresh email, extract `devLink`, curl it with `-c cookies.txt`, reuse `f404_session` as the Cookie header. Negative: a second visit to the same devLink must 302 to `?error=expired`; `POST /api/v1/auth/logout` then `/api/v1/me` → 401.

## Gotchas

- The devLink echoes the request origin; under `wrangler dev` with custom-domain routes it may point at the production domain — rewrite the origin before curling (Node instance is fine).
- Rate limit: ~20 magic requests per IP per 15 min (`magicRateLimit`); a verification loop that signs in repeatedly will hit 429 — reuse one session per run.
