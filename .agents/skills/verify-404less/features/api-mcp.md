# API keys & MCP

## Sub-features

- Team API keys: `POST /api/v1/teams/:teamId/keys` returns `{key:{id,prefix}, secret}` — the full `secret` (`404l_…`) appears exactly once, at the top level; list shows `prefix` only; delete revokes immediately. Max keys per team.
- MCP over streamable HTTP at `POST /mcp` with `Authorization: Bearer <key>`: initialize → tools/list → tools/call; four read-only tools (`list_sites`, `list_broken_links`, `get_link_details`, `get_suggestions`). Structured errors (unknown site → isError + message, not a crash).
- The same bearer works on the dashboard JSON API under `/api/v1`, acting as the key's team owner but **confined to the key's team**: listings show only that team's sites/teams, and a `teamId` for any other team (site creation, keys, channels) is refused — documented on the marketing /agent page and pinned by tests/worker/mcp.test.ts.

## How to get to it (user POV)

Sidebar → "API & MCP": key creation with copy-once UX, per-agent connect snippets (claude/codex/cursor…), MCP setup instructions.

## Driving it with curl

Create the key (session cookie), then:

- `POST /mcp` `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}` (headers: Content-Type + Accept `application/json, text/event-stream`)
- `tools/list`, then `tools/call` `list_broken_links` with `{"site":"<domain>","status":"all"}` — assert real URLs from earlier steps.
- `GET /api/v1/sites` with the same bearer → the key's team's sites; a bogus key → 401.

## Gotchas

- MCP responses are plain JSON (`Content-Type: application/json`), one JSON-RPC object per response — parse `r.json()` directly, no SSE.
- Keys are team-scoped: cross-team isolation means a key never sees another team's sites even for the same user (pinned test).
- The bearer path sets `bearerTeamId` — `/api/v1/me` still answers for the resolved owner; don't assert team listing equals the user's every team.
